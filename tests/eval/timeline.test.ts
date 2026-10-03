// Acceptance tests for the BMS-vs-Voltify screen (CLAUDE.md section 12): Voltify warns before the
// BMS cuts off, the lead time is what the simulation measures, and after the intervention the
// temperature really stops rising. Seed 202 is the demo seed.
import { describe, expect, it } from 'vitest';
import type { Brand } from '@/adapters';
import { DEFAULT_POLICY } from '@/intervention';
import { runAB, runTimeline, type Timeline } from '@/eval/timeline';
import { LIMIT_TEMP_C } from '@/ai';

const BRANDS: Brand[] = ['A', 'B', 'C'];
const DURATION = 2400;
const hero = Object.fromEntries(BRANDS.map((brand) => [brand, runAB({ scenario: 'severeHeatLoad', seed: 202, brand, durationS: DURATION })]));

const tempSeries = (t: Timeline) => t.frames.map((f) => f.truth.coreTempC);

describe.each(BRANDS)('hero scenario, brand %s', (brand) => {
  const { bms, voltify, leadTimeS } = hero[brand];

  it('the traditional BMS only reacts at 65 degC, and the bike dies on the road', () => {
    expect(bms.summary.bmsTripS).not.toBeNull();
    expect(bms.summary.peakTempC).toBeGreaterThanOrEqual(LIMIT_TEMP_C);
    expect(bms.summary.vehicleStoppedS).toBe(bms.summary.bmsTripS);
    expect(bms.events.map((e) => e.kind)).toEqual(['bms_trip', 'vehicle_stopped']);
    expect(bms.frames.every((f) => f.assessment === null)).toBe(true); // no AI in this world
  });

  it('Voltify warns before the BMS cut-off, and the lead time is exactly the measured difference', () => {
    expect(voltify.summary.alertS).not.toBeNull();
    expect(voltify.summary.alertS!).toBeLessThan(bms.summary.bmsTripS!);
    expect(leadTimeS).toBeCloseTo(bms.summary.bmsTripS! - voltify.summary.alertS!, 9);
    expect(leadTimeS!).toBeGreaterThan(10 * 60);
  });

  it('after the intervention the temperature really stops rising, and the pack never reaches the BMS limit', () => {
    const v = voltify.summary;
    expect(v.bmsTripS).toBeNull();
    expect(v.vehicleStoppedS).toBeNull();
    expect(v.peakTempC).toBeLessThan(LIMIT_TEMP_C - 5);
    expect(v.peakTempC).toBeLessThan(bms.summary.peakTempC - 5);
    // The rise ends at or soon after the swap, and the pack then only cools.
    expect(v.peakAtS).toBeLessThan(v.swapS! + 120);
    const after = tempSeries(voltify).filter((_, i) => voltify.frames[i].tS > v.peakAtS + 120);
    expect(Math.max(...after)).toBeLessThan(v.peakTempC); // it never climbs back above its peak
    expect(v.finalTempC).toBeLessThan(v.peakTempC - 2);
    // Temperature was rising before the intervention (this is not a trivial case).
    const first = voltify.frames[0].truth.coreTempC;
    expect(v.peakTempC).toBeGreaterThan(first + 2);
  });

  it('runs the plan in order: alert, power cut, shipper notified, swap', () => {
    const kinds = voltify.events.map((e) => e.kind);
    expect(kinds).toEqual(['ai_alert', 'derate_sent', 'shipper_notified', 'swap_done']);
    const [alert, cut, notified, swap] = voltify.events;
    expect(cut.tS - alert.tS).toBe(DEFAULT_POLICY.commandLatencyS);
    expect(cut.derate).toBe(0.15);
    expect(notified.stationId).toMatch(/^HCM-\d{3}$/);
    expect(notified.distanceM!).toBeGreaterThan(0);
    const expectedSwap =
      cut.tS + DEFAULT_POLICY.shipperReactionS + notified.distanceM! / DEFAULT_POLICY.rideSpeedMs + DEFAULT_POLICY.swapHandlingS;
    expect(swap.tS).toBeCloseTo(expectedSwap, 6);
    expect(swap.tS).toBeLessThan(bms.summary.bmsTripS!); // the swap happens well before the cut-off would have
  });

  it('is the same world until the first command takes effect (same seed, bit-identical)', () => {
    const cutAt = voltify.summary.derateS!;
    const before = <T>(t: Timeline, pick: (f: Timeline['frames'][number]) => T) =>
      t.frames.filter((f) => f.tS < cutAt).map(pick);
    expect(before(voltify, (f) => JSON.stringify(f.telemetry))).toEqual(before(bms, (f) => JSON.stringify(f.telemetry)));
    expect(before(voltify, (f) => f.truth.coreTempC)).toEqual(before(bms, (f) => f.truth.coreTempC));
    // ... and they part ways afterwards.
    const afterV = voltify.frames.filter((f) => f.tS >= cutAt + 120).map((f) => f.truth.coreTempC);
    const afterB = bms.frames.filter((f) => f.tS >= cutAt + 120).map((f) => f.truth.coreTempC);
    expect(afterV.slice(0, 20)).not.toEqual(afterB.slice(0, 20));
  });
});

describe('derate alone versus derate plus swap (spec: a 15 % cut slows the rise; the swap ends it)', () => {
  const policyDerateOnly = { ...DEFAULT_POLICY, swapHandlingS: 1e9, fallbackSwapDelayS: 1e9 };

  it('lowers the peak compared with doing nothing, for every brand', () => {
    for (const brand of BRANDS) {
      const only = runTimeline({ scenario: 'severeHeatLoad', seed: 202, brand, durationS: DURATION, mode: 'voltify', policy: policyDerateOnly });
      expect(only.summary.swapS).toBeGreaterThan(1e8); // never swapped
      expect(only.summary.peakTempC, brand).toBeLessThan(hero[brand].bms.summary.peakTempC + 1e-9);
      // The full intervention is clearly better than the cut alone.
      expect(hero[brand].voltify.summary.peakTempC, brand).toBeLessThan(only.summary.peakTempC - 3);
    }
  });
});

describe('control scenario: an ordinary hot day', () => {
  it.each(BRANDS)('raises no alert and takes no action, and both worlds are identical (brand %s)', (brand) => {
    const { bms, voltify, leadTimeS } = runAB({ scenario: 'heatwave43', seed: 202, brand, durationS: DURATION });
    expect(voltify.summary.alertS).toBeNull();
    expect(voltify.events).toEqual([]);
    expect(bms.summary.bmsTripS).toBeNull();
    expect(leadTimeS).toBeNull();
    expect(tempSeries(voltify)).toEqual(tempSeries(bms));
    expect(voltify.frames.every((f) => !f.truth.parked && f.truth.derate === 0)).toBe(true);
  });
});

describe('timeline determinism and bookkeeping', () => {
  it('replays identically from the same seed', () => {
    const a = runAB({ scenario: 'severeHeatLoad', seed: 202, brand: 'A', durationS: DURATION });
    expect(JSON.stringify(a)).toBe(JSON.stringify(hero.A));
  });

  it('records one frame per vendor message of the monitored battery, in time order', () => {
    const { voltify } = hero.A; // brand A reports every 5 s
    expect(voltify.frames.length).toBe(DURATION / 5);
    for (let i = 1; i < voltify.frames.length; i++) expect(voltify.frames[i].tS).toBe(voltify.frames[i - 1].tS + 5);
    const c = hero.C.voltify; // brand C reports every 15 s
    expect(c.frames.length).toBeLessThanOrEqual(DURATION / 15 + 1);
    expect(c.frames.length).toBeGreaterThan(DURATION / 15 - 2);
  });

  it('observe mode runs the AI but never acts', () => {
    const t = runTimeline({ scenario: 'severeHeatLoad', seed: 202, brand: 'A', durationS: DURATION, mode: 'observe' });
    expect(t.frames.every((f) => f.assessment !== null && !f.truth.parked && f.truth.derate === 0)).toBe(true);
    expect(t.summary.alertS).not.toBeNull();
    expect(t.summary.bmsTripS).toBeCloseTo(hero.A.bms.summary.bmsTripS!, 9); // same fate as without the AI
  });

  it('can watch a developing internal short injected at runtime', () => {
    const t = runTimeline({
      scenario: 'baseline',
      seed: 202,
      brand: 'B',
      durationS: 4200,
      mode: 'observe',
      inject: { atS: 1200, fault: { rShortOhm0: 20, rShortMinOhm: 0.08, tauS: 300 } },
    });
    expect(t.summary.alertS).not.toBeNull();
    expect(t.summary.alertS!).toBeGreaterThan(1200);
    expect(t.frames.some((f) => f.truth.qFaultW > 5)).toBe(true);
  });
});
