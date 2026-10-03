// The chart builders are pure functions of (timeline, playback time, colours, t), so they can be
// checked without a browser: that they draw only what has happened, mark the right events, and
// keep the 65 degC limit in view.
import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';
import { runAB, runTimeline } from '@/eval/timeline';
import { countUpTo } from '@/lib/timelineSeries';
import { buildAbOption } from '@/pages/ab/abChart';
import { AB_DURATION_S, abSpec } from '@/pages/ab/abConfig';
import { TWIN_CASES, TWIN_SPECS } from '@/pages/twin/twinConfig';
import { cellHeatmapOption, heatOption, riskOption, sohOption, temperatureOption } from '@/pages/twin/twinCharts';

const t = ((key: string, opts?: Record<string, unknown>) => (opts ? `${key}${JSON.stringify(opts)}` : key)) as unknown as TFunction;
const colors = { text: '#fff', muted: '#999', border: '#333', surface: '#111', accent: '#0f0', safe: '#0f0', watch: '#ff0', warning: '#fa0', danger: '#f00' };

const ab = runAB(abSpec('severeHeatLoad', 'A', 'full'));
const bmsTrip = ab.bms.summary.bmsTripS!;
const alert = ab.voltify.summary.alertS!;

interface Mark { xAxis?: number; yAxis?: number; label?: { formatter?: string } }
const marksOf = (option: ReturnType<typeof buildAbOption>): Mark[] => {
  const s = (option.series as { markLine?: { data: Mark[] } }[])[0];
  return s.markLine?.data ?? [];
};
const dataOf = (option: ReturnType<typeof buildAbOption>, i: number) => ((option.series as { data: unknown[] }[])[i].data);

describe('BMS vs Voltify chart', () => {
  const build = (timeline: typeof ab.bms, side: 'bms' | 'voltify', tS: number) =>
    buildAbOption({ timeline, side, tS, durationS: AB_DURATION_S, colors, t });

  it('always shows the 65 degC BMS limit, on a fixed axis shared by both sides', () => {
    for (const [tl, side] of [[ab.bms, 'bms'], [ab.voltify, 'voltify']] as const) {
      const o = build(tl, side, 0);
      expect(marksOf(o).some((m) => m.yAxis === 65)).toBe(true);
      expect((o.yAxis as { min: number; max: number }).min).toBe(30);
      expect((o.yAxis as { min: number; max: number }).max).toBe(70);
      expect((o.xAxis as { max: number }).max).toBe(AB_DURATION_S / 60);
    }
  });

  it('draws only the frames that have happened by the playback time', () => {
    for (const tS of [0, 120, 900, AB_DURATION_S]) {
      const o = build(ab.voltify, 'voltify', tS);
      expect(dataOf(o, 0)).toHaveLength(countUpTo(ab.voltify.frames, tS));
    }
  });

  it('marks the BMS cut-off only once it has happened, and shades the stranded stretch', () => {
    const before = build(ab.bms, 'bms', bmsTrip - 30);
    const after = build(ab.bms, 'bms', bmsTrip + 60);
    expect(marksOf(before).filter((m) => m.xAxis !== undefined)).toHaveLength(0);
    const trip = marksOf(after).filter((m) => m.xAxis !== undefined);
    expect(trip).toHaveLength(1);
    expect(trip[0].xAxis).toBeCloseTo(bmsTrip / 60, 9);
    expect(((after.series as { markArea: { data: unknown[] } }[])[0].markArea.data)).toHaveLength(1);
    expect(((before.series as { markArea: { data: unknown[] } }[])[0].markArea.data)).toHaveLength(0);
  });

  it('merges the alert and the power cut it triggers into one marker, then adds the swap', () => {
    const afterCut = marksOf(build(ab.voltify, 'voltify', alert + 60)).filter((m) => m.xAxis !== undefined);
    expect(afterCut).toHaveLength(1);
    expect(afterCut[0].label!.formatter).toBe('ab.marks.alert_and_cut');
    const end = marksOf(build(ab.voltify, 'voltify', AB_DURATION_S)).filter((m) => m.xAxis !== undefined);
    expect(end.map((m) => m.label!.formatter)).toEqual(['ab.marks.alert_and_cut', 'ab.marks.swap_done']);
  });

  it('shows the AI expectation only on the Voltify side', () => {
    expect(((build(ab.bms, 'bms', 600).series) as unknown[]).length).toBe(2);
    expect(((build(ab.voltify, 'voltify', 600).series) as unknown[]).length).toBe(3);
  });
});

describe('Digital Twin charts', () => {
  const short = runTimeline(TWIN_SPECS.shortCircuit);
  const base = (tS: number) => ({ timeline: short, tS, durationS: short.spec.durationS, colors, t });

  it('adds the simulation truth only when asked', () => {
    const without = temperatureOption({ ...base(2000), showTruth: false, etaS: null });
    const withTruth = temperatureOption({ ...base(2000), showTruth: true, etaS: null });
    expect((without.series as unknown[]).length).toBe(3);
    expect((withTruth.series as unknown[]).length).toBe(4);
    expect((heatOption({ ...base(2000), showTruth: false }).series as unknown[]).length).toBe(1);
    expect((heatOption({ ...base(2000), showTruth: true }).series as unknown[]).length).toBe(2);
    expect((sohOption({ ...base(2000), showTruth: true }).series as unknown[]).length).toBe(2);
  });

  it('marks a forecast time-to-limit on the temperature chart when there is one', () => {
    const none = temperatureOption({ ...base(2000), showTruth: false, etaS: null });
    const some = temperatureOption({ ...base(2000), showTruth: false, etaS: 600 });
    const count = (o: ReturnType<typeof temperatureOption>) => marksOf(o as never).filter((m) => m.xAxis !== undefined).length;
    expect(count(some)).toBe(count(none) + 1);
  });

  it('keeps the 65 degC limit inside the temperature axis whatever the data', () => {
    const o = temperatureOption({ ...base(2000), showTruth: false, etaS: null });
    const y = o.yAxis as { min: (v: { min: number }) => number; max: (v: { max: number }) => number };
    expect(y.max({ max: 38 })).toBeGreaterThanOrEqual(68);
    expect(y.min({ min: 35 })).toBeLessThan(60);
  });

  it('draws the Risk Score stacked by the four modules with the three level thresholds', () => {
    const o = riskOption(base(3000));
    const series = o.series as { name: string; stack: string; markLine?: { data: { yAxis: number }[] } }[];
    expect(series).toHaveLength(4);
    expect(new Set(series.map((s) => s.stack))).toEqual(new Set(['score']));
    expect(series[0].markLine!.data.map((d) => d.yAxis)).toEqual([25, 50, 75]);
  });

  it('fills the cell heatmap column by column and keeps its width fixed to the whole run', () => {
    const early = cellHeatmapOption(base(600));
    const late = cellHeatmapOption(base(4000));
    const cols = (o: ReturnType<typeof cellHeatmapOption>) => (o.xAxis as { data: string[] }).data.length;
    expect(cols(early)).toBe(cols(late));
    const cells = (o: ReturnType<typeof cellHeatmapOption>) => ((o.series as { data: unknown[] }[])[0].data).length;
    expect(cells(late)).toBeGreaterThan(cells(early));
    expect(cells(late) % 16).toBe(0);
  });
});

describe('Digital Twin cases', () => {
  const runs = Object.fromEntries(TWIN_CASES.map((c) => [c, runTimeline(TWIN_SPECS[c])])) as Record<(typeof TWIN_CASES)[number], ReturnType<typeof runTimeline>>;
  const peakScore = (tl: (typeof runs)['healthy']) => Math.max(...tl.frames.map((f) => f.assessment!.risk.score));

  it('the healthy pack never reaches warning', () => {
    expect(runs.healthy.summary.alertS).toBeNull();
    expect(peakScore(runs.healthy)).toBeLessThan(50);
  });

  it('the overload case is flagged before the BMS would have cut off', () => {
    expect(runs.overload.summary.alertS).not.toBeNull();
    expect(runs.overload.summary.alertS!).toBeLessThan(runs.overload.summary.bmsTripS!);
  });

  it('the developing short is flagged only after it starts, and the AI names the leaking cell', () => {
    const t = runs.shortCircuit;
    expect(t.summary.alertS!).toBeGreaterThan(1200);
    const last = t.frames[t.frames.length - 1].assessment!;
    // The cell the simulator shorted (ground truth) is the one the AI points at.
    expect(t.summary.faultCell).not.toBeNull();
    expect(last.voltage.driftCell).toBe(t.summary.faultCell);
    expect(last.voltage.worstCell).toBe(t.summary.faultCell);
    expect(last.voltage.driftSocPct).toBeGreaterThan(1);
  });

  it('the weak-cell case is reported as a weak cell rather than a fire signal', () => {
    const last = runs.weakCell.frames[runs.weakCell.frames.length - 1].assessment!;
    expect(last.voltage.weakExcessMOhm).toBeGreaterThan(0.8);
  });

  it('the aged pack reads as clearly aged', () => {
    const last = runs.aged.frames[runs.aged.frames.length - 1].assessment!;
    expect(last.impedance.sohEst).toBeLessThan(0.8);
    expect(last.impedance.class).not.toBe('good');
  });
});
