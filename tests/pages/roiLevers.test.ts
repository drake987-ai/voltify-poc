import { describe, expect, it } from 'vitest';
import { computeRoi, defaultRoiInputs, lifeExtensionFromChargeCooling } from '@/business/roi';
import {
  CASES,
  LEVERS,
  TARGET_ELECTRICITY_SAVING_PCT,
  TARGET_LIFE_EXTENSION_PCT,
  leverValue,
  scenarioOf,
  type Measured,
} from '@/pages/roi/levers';
import { TRACE_IDS, traceRows, type TraceFormat } from '@/pages/roi/trace';
import en from '@/i18n/en.json';
import vi from '@/i18n/vi.json';

const inputs = defaultRoiInputs();
const noMeasure: Measured = { chargeTempDropC: null, preventionRate: null };
const measured: Measured = { chargeTempDropC: 4.1, preventionRate: 2 / 3 };

describe('careful case', () => {
  it('counts only what a simulation measured, and nothing for what it did not', () => {
    expect(leverValue('careful', 'lifeExtensionPct', inputs, measured)).toEqual({
      value: lifeExtensionFromChargeCooling({ tempC: inputs.rideTempC, chargeShare: inputs.chargeShare }, 4.1),
      source: 'measured',
    });
    expect(leverValue('careful', 'preventionPct', inputs, measured)).toEqual({ value: (2 / 3) * 100, source: 'measured' });
    // The PoC did not measure any electricity saving.
    expect(leverValue('careful', 'electricitySavingPct', inputs, measured)).toEqual({ value: 0, source: 'unmeasured' });
  });

  it('shows a pending lever, not an invented value, while a measurement is still running', () => {
    expect(leverValue('careful', 'lifeExtensionPct', inputs, noMeasure)).toEqual({ value: 0, source: 'pending' });
    expect(leverValue('careful', 'preventionPct', inputs, noMeasure)).toEqual({ value: 0, source: 'unmeasured' });
  });

  it('follows the inputs: the same cooler charge helps more when more of each cycle is spent charging', () => {
    const low = leverValue('careful', 'lifeExtensionPct', { ...inputs, chargeShare: 0.3 }, measured).value;
    const high = leverValue('careful', 'lifeExtensionPct', { ...inputs, chargeShare: 0.7 }, measured).value;
    expect(high).toBeGreaterThan(low);
  });
});

describe('target case', () => {
  it('uses the targets of the brief and labels them as such, whatever was measured', () => {
    for (const m of [noMeasure, measured]) {
      expect(leverValue('target', 'lifeExtensionPct', inputs, m)).toEqual({ value: TARGET_LIFE_EXTENSION_PCT, source: 'target' });
      expect(leverValue('target', 'electricitySavingPct', inputs, m)).toEqual({ value: TARGET_ELECTRICITY_SAVING_PCT, source: 'target' });
    }
    expect(TARGET_LIFE_EXTENSION_PCT).toBe(35);
    expect(TARGET_ELECTRICITY_SAVING_PCT).toBe(20);
  });

  it('is the careful case plus the targets: never worse in any lever', () => {
    const careful = scenarioOf('careful', inputs, measured);
    const target = scenarioOf('target', inputs, measured);
    expect(target.lifeExtensionPct).toBeGreaterThan(careful.lifeExtensionPct);
    expect(target.electricitySavingPct).toBeGreaterThan(careful.electricitySavingPct);
    expect(target.preventionRate).toBeGreaterThanOrEqual(careful.preventionRate);
    expect(computeRoi(inputs, target).netPerYearVnd).toBeGreaterThan(computeRoi(inputs, careful).netPerYearVnd);
  });
});

describe('overrides', () => {
  it('replace a default, per case and per lever, and are marked as typed in', () => {
    const o = { 'careful.lifeExtensionPct': 12 } as const;
    expect(leverValue('careful', 'lifeExtensionPct', inputs, measured, o)).toEqual({ value: 12, source: 'override' });
    expect(leverValue('target', 'lifeExtensionPct', inputs, measured, o).source).toBe('target');
    expect(scenarioOf('careful', inputs, measured, o).lifeExtensionPct).toBe(12);
  });

  it('keep the prevention rate within 0 to 100 %', () => {
    expect(scenarioOf('careful', inputs, measured, { 'careful.preventionPct': 250 }).preventionRate).toBe(1);
    expect(scenarioOf('careful', inputs, measured, { 'careful.preventionPct': -5 }).preventionRate).toBe(0);
  });

  it('cover every case and lever with a defined default', () => {
    for (const c of CASES) for (const l of LEVERS) expect(Number.isFinite(leverValue(c, l, inputs, measured).value)).toBe(true);
  });
});

describe('figure traces', () => {
  const id: TraceFormat = {
    num: (x, dp = 0) => x.toFixed(dp),
    vnd: (x) => `VND ${Math.round(x)}`,
    pct: (x, dp = 1) => `${x.toFixed(dp)}%`,
  };
  const r = computeRoi(inputs, scenarioOf('target', inputs, measured));

  it('end at the figure the screen shows', () => {
    const last = (t: (typeof TRACE_IDS)[number]) => traceRows(t, r, id).slice(-1)[0].value;
    expect(last('replacement')).toBe(id.vnd(r.savings.replacementVnd));
    expect(last('energy')).toBe(id.vnd(r.savings.energyVnd));
    expect(last('incidents')).toBe(id.vnd(r.savings.incidentsVnd));
    expect(last('payback')).toBe(id.num(r.paybackMonths!, 1));
    expect(traceRows('life', r, id).find((x) => x.step === 'daysAdded')!.value).toBe(id.num(r.lifeAddedDays, 0));
    expect(traceRows('net', r, id).find((x) => x.step === 'netBenefit')!.value).toBe(id.vnd(r.netPerYearVnd));
  });

  it('show the inputs they depend on', () => {
    const rows = traceRows('replacement', r, id);
    expect(rows.find((x) => x.step === 'packCost')!.value).toBe(id.vnd(inputs.packCostVnd));
    expect(rows.find((x) => x.step === 'lifeExtension')!.value).toBe('35.0%');
  });

  it('show a dash, not a made-up number, where a figure does not exist', () => {
    const loss = computeRoi(inputs, { lifeExtensionPct: 0, electricitySavingPct: 0, preventionRate: 0 });
    expect(traceRows('payback', loss, id).find((x) => x.step === 'paybackMonths')!.value).toBe('—');
  });

  it('are described in both languages, step by step', () => {
    for (const locale of [vi, en]) {
      for (const t of TRACE_IDS) {
        expect(locale.roi.trace.formulas[t], t).toBeTruthy();
        expect(locale.roi.outputs[t].label, t).toBeTruthy();
        for (const row of traceRows(t, r, id)) {
          expect((locale.roi.trace.steps as Record<string, string>)[row.step], `${t}.${row.step}`).toBeTruthy();
        }
      }
    }
  });
});
