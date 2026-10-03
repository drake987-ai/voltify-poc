import { describe, expect, it } from 'vitest';
import type { Brand } from '@/adapters';
import { createCabinet, stepCabinet } from '@/intervention';
import { runCabinetAB } from '@/eval/cabinet';
import { fadePerEfc, projectMixedLifetime } from '@/sim';
import { AI_CONFIG, createEngine, ingest, type Assessment } from '@/ai';
import { normalize } from '@/adapters';
import { SIM, createFleet, stepFleet } from '@/sim';

const BRANDS: Brand[] = ['A', 'B', 'C'];
const DURATION = 18_000; // 5 h: long enough for the reduced charge to reach full as well
const runs = Object.fromEntries(BRANDS.map((brand) => [brand, runCabinetAB({ seed: 202, brand, durationS: DURATION })]));

describe('fast charging in a hot cabinet: with and without the platform cutting the charge current', () => {
  it.each(BRANDS)('keeps the pack cooler while charging (brand %s)', (brand) => {
    const r = runs[brand];
    expect(r.summaryWith.meanTempC).toBeLessThan(r.summaryWithout.meanTempC - 1.5);
    expect(r.summaryWith.peakTempC).toBeLessThan(r.summaryWithout.peakTempC - 1.5);
    expect(r.summaryWithout.peakTempC).toBeGreaterThan(54); // genuinely hot at full rate
    expect(r.summaryWithout.peakTempC).toBeLessThan(65); // ... but the BMS never had to cut off
  });

  it.each(BRANDS)('pays for it in charging time (brand %s)', (brand) => {
    const r = runs[brand];
    expect(r.summaryWithout.fullS).not.toBeNull();
    expect(r.summaryWith.fullS).not.toBeNull();
    expect(r.summaryWith.fullS!).toBeGreaterThan(1.5 * r.summaryWithout.fullS!);
    expect(r.summaryWith.minScale).toBeLessThan(1);
    expect(r.summaryWithout.minScale).toBe(1);
  });

  it.each(BRANDS)('slows the ageing during the charge and projects a longer life (brand %s)', (brand) => {
    const r = runs[brand];
    expect(r.summaryWith.meanFadePerEfc).toBeLessThan(r.summaryWithout.meanFadePerEfc);
    expect(r.lifetimeWith.efcToEol).toBeGreaterThan(r.lifetimeWithout.efcToEol);
    expect(r.lifetimeGainPct).toBeGreaterThan(1);
    // Modest and honest: charging is only part of each cycle, so the whole-life gain is a few percent,
    // far below the 35 % target that has to be confirmed in a pilot.
    expect(r.lifetimeGainPct).toBeLessThan(15);
  });

  it('is the same pack and cabinet until the first command (bit-identical start)', () => {
    const r = runs.A;
    const cmdAt = r.with.cabinetEvents[0].tS;
    const head = (t: typeof r.with) => t.frames.filter((f) => f.tS < cmdAt).map((f) => JSON.stringify(f.telemetry));
    expect(head(r.with)).toEqual(head(r.without));
    expect(r.with.cabinetEvents[0].kind).toBe('charge_reduced');
  });

  it('is deterministic', () => {
    expect(JSON.stringify(runCabinetAB({ seed: 202, brand: 'A', durationS: DURATION }))).toBe(JSON.stringify(runs.A));
  });
});

describe('cabinet policy', () => {
  /** Assessment of a pack being charged: hot and over the charge curve. */
  function hotChargingAssessment(): Assessment {
    const fleet = createFleet({ seed: 202, n: 4, scenario: 'hotCabinet' });
    const engine = createEngine();
    let last!: Assessment;
    for (let k = 0; k < 120; k++) {
      for (const f of stepFleet(fleet).frames) {
        const p = normalize(f.payload);
        if (p.ok && f.batteryId === fleet.batteries[0].config.id) last = ingest(engine, p.value);
      }
    }
    return last;
  }

  /** What the AI would see one step later: the same pack, but drawing only `scale` of the current. */
  const seenAt = (a: Assessment, scale: number, over: Partial<Assessment['overload']> = {}): Assessment => ({
    ...a,
    overload: { ...a.overload, cRate: a.overload.cRate * scale, cRateRms: a.overload.cRateRms * scale, ...over },
  });

  it('cuts the charge to what the derating curve allows, once, and restores it when charging ends', () => {
    const a = hotChargingAssessment();
    expect(a.overload.charging).toBe(true);
    const s = createCabinet();
    const first = stepCabinet(s, a, 100);
    const scale = first.chargeCurrentScale;
    expect(scale).toBeLessThan(1);
    expect(scale).toBeGreaterThanOrEqual(0.2);
    // Either the current now fits inside the curve (with its margin, to within the command step) or the floor was hit.
    expect(scale === 0.2 || a.overload.cRate * scale <= AI_CONFIG.overload.targetRatio * a.overload.limitC + 0.05 * a.overload.cRate).toBe(true);
    expect(s.events.map((e) => e.kind)).toEqual(['charge_reduced']);

    // Charging ends (a minute or more later): back to the full rate.
    const done = seenAt(a, scale, { charging: false, hotCharge: false, ratio: 0 });
    expect(stepCabinet(s, done, 200).chargeCurrentScale).toBe(1);
    expect(s.events[s.events.length - 1].kind).toBe('charge_restored');
  });

  it('does not feed its own cut back into itself: the AI now sees the reduced current, the command stays put', () => {
    const a = hotChargingAssessment();
    const s = createCabinet();
    const scale = stepCabinet(s, a, 100).chargeCurrentScale;
    // Every later step sees the reduced current; with nothing else changing, nothing should be sent.
    for (let tS = 105; tS <= 1000; tS += 5) {
      expect(stepCabinet(s, seenAt(a, scale), tS).chargeCurrentScale).toBe(scale);
    }
    expect(s.events).toHaveLength(1);
  });

  it('sends a larger current when the pack has cooled, but not more often than once a minute', () => {
    const a = hotChargingAssessment();
    const s = createCabinet();
    const scale = stepCabinet(s, a, 100).chargeCurrentScale;
    const cooler = seenAt(a, scale, { limitC: a.overload.cRate, hotCharge: false, ratio: 0.9 }); // the curve now allows the full request

    stepCabinet(s, cooler, 130); // 30 s after the last command: too soon
    expect(s.events).toHaveLength(1);
    const later = stepCabinet(s, cooler, 170).chargeCurrentScale;
    expect(later).toBeGreaterThan(scale);
    expect(s.events[s.events.length - 1].kind).toMatch(/charge_adjusted|charge_restored/);
  });

  it('ignores the trickle at the end of a charge', () => {
    const a = hotChargingAssessment();
    const s = createCabinet();
    const trickle = seenAt(a, 0.01, { hotCharge: true, ratio: 2 });
    expect(stepCabinet(s, trickle, 0).chargeCurrentScale).toBe(1);
    expect(s.events).toEqual([]);
  });

  it('leaves a cool pack on a normal charge alone', () => {
    const a = hotChargingAssessment();
    const cool = { ...a, overload: { ...a.overload, hotCharge: false, ratio: 0.9 } };
    const s = createCabinet();
    expect(stepCabinet(s, cool, 0).chargeCurrentScale).toBe(1);
    expect(s.events).toEqual([]);
  });

  it('never sends commands closer than a minute apart over a whole charge', () => {
    const events = runs.A.with.cabinetEvents;
    expect(events.length).toBeGreaterThan(0);
    for (let i = 1; i < events.length; i++) expect(events[i].tS - events[i - 1].tS).toBeGreaterThanOrEqual(60);
  });
});

describe('lifetime projection for a mixed charge/ride cycle', () => {
  it('is the share-weighted average of the charge and ride fade rates', () => {
    const charge = fadePerEfc(55);
    const p = projectMixedLifetime({ chargeFadePerEfc: charge, rideTempC: 40, chargeShare: 0.5, efcPerDay: 1.5 });
    expect(p.fadePerEfc).toBeCloseTo(0.5 * charge + 0.5 * fadePerEfc(40), 15);
    expect(p.efcToEol).toBeCloseTo(0.2 / p.fadePerEfc, 9);
    expect(p.daysToEol).toBeCloseTo(p.efcToEol / 1.5, 9);
  });

  it('lives longer the cooler the charge', () => {
    const hot = projectMixedLifetime({ chargeFadePerEfc: fadePerEfc(58), rideTempC: 42, efcPerDay: 1.5 });
    const cool = projectMixedLifetime({ chargeFadePerEfc: fadePerEfc(50), rideTempC: 42, efcPerDay: 1.5 });
    expect(cool.efcToEol).toBeGreaterThan(hot.efcToEol);
    expect(SIM.tickS).toBe(5);
  });
});
