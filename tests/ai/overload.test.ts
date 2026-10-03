import { describe, expect, it } from 'vitest';
import {
  PACK_NOMINAL,
  chargeLimitC,
  dischargeLimitC,
  initOverload,
  overloadSeverity,
  stepOverload,
  type OverloadOutput,
} from '@/ai';

const nom = PACK_NOMINAL.A; // 25 Ah

/** Hold a constant current for `seconds` and return the final output. */
function hold(currentA: number, tempC: number, seconds = 600): OverloadOutput {
  const s = initOverload(0, currentA);
  let o!: OverloadOutput;
  for (let t = 5; t <= seconds; t += 5) o = stepOverload(s, t, currentA, tempC, nom);
  return o;
}

describe('derating curves', () => {
  it('allow less current as the pack gets hotter', () => {
    expect(dischargeLimitC(30)).toBeGreaterThan(dischargeLimitC(45));
    expect(dischargeLimitC(45)).toBeGreaterThan(dischargeLimitC(55));
    expect(dischargeLimitC(55)).toBeGreaterThan(dischargeLimitC(62));
    expect(dischargeLimitC(65)).toBe(0);
    expect(dischargeLimitC(35)).toBeCloseTo(2.0, 9);
    expect(chargeLimitC(25)).toBeCloseTo(0.5, 9);
    expect(chargeLimitC(45)).toBeLessThan(chargeLimitC(40));
    expect(chargeLimitC(56)).toBe(0);
  });

  it('interpolate linearly between table points', () => {
    expect(dischargeLimitC(40)).toBeCloseTo(1.75, 9); // halfway between 2.0 at 35 and 1.5 at 45
  });
});

describe('overload ratio', () => {
  it('is the RMS C-rate over the allowed C-rate at the present temperature', () => {
    const o = hold(40, 50); // 40 A on 25 Ah = 1.6 C; allowed at 50 degC = 1.15 C
    expect(o.cRateRms).toBeCloseTo(1.6, 2);
    expect(o.limitC).toBeCloseTo(1.15, 9);
    expect(o.ratio).toBeCloseTo(1.6 / 1.15, 2);
  });

  it('is below 1 for the same current on a cool pack, so it is no overload there', () => {
    const o = hold(40, 30);
    expect(o.ratio).toBeLessThan(1);
    expect(overloadSeverity(o).total).toBe(0);
  });

  it('smooths bursts: a few seconds of peak current do not make an overload', () => {
    const s = initOverload(0, 5);
    let o!: OverloadOutput;
    for (let t = 5; t <= 600; t += 5) o = stepOverload(s, t, t % 120 === 0 ? 70 : 5, 40, nom); // one 70 A sample per 2 min
    expect(o.ratio).toBeLessThan(1);
  });

  it('recommends a derate only when over the curve, and never more than the cap', () => {
    expect(hold(10, 30).recommendedDerate).toBe(0);
    const over = hold(45, 52);
    expect(over.ratio).toBeGreaterThan(1);
    expect(over.recommendedDerate).toBeGreaterThanOrEqual(0.05);
    expect(over.recommendedDerate).toBeLessThanOrEqual(0.3);
    // After applying it the load sits near the target ratio (0.9) unless capped.
    const modest = hold(31, 50); // ratio about 1.08
    expect((1 - modest.recommendedDerate) * modest.ratio).toBeCloseTo(0.9, 1);
  });

  it('judges charging against the charge curve and flags charging a hot pack', () => {
    const normal = hold(-12.5, 30); // 0.5 C at 30 degC
    expect(normal.charging).toBe(true);
    expect(normal.ratio).toBeCloseTo(1.0, 1);
    expect(normal.hotCharge).toBe(false);
    expect(overloadSeverity(normal).total).toBe(0);

    const hot = hold(-12.5, 47);
    expect(hot.hotCharge).toBe(true);
    expect(hot.ratio).toBeGreaterThan(1.5);
    expect(hot.recommendedChargeScale).toBeLessThan(1);
    expect(overloadSeverity(hot).total).toBeGreaterThan(0.3);
  });
});
