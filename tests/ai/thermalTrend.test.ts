import { describe, expect, it } from 'vitest';
import type { Brand } from '@/adapters';
import {
  AI_CONFIG,
  LIMIT_TEMP_C,
  PACK_NOMINAL,
  TEMP_SIGMA_C,
  emptyFit,
  initThermal,
  rateOf,
  stepThermal,
  thermalOutput,
  timeToLimitS,
  updateRateFit,
  type ThermalOutput,
  type ThermalState,
} from '@/ai';
import { DT_S, synthThermal, type ThermalSynthOptions } from './helpers';

const PACK_OHM = 0.07;
const RES: Record<Brand, number> = { A: 0.1, B: 0.1, C: 0.5 };
const BRANDS: Brand[] = ['A', 'B', 'C'];

/** Run the filter over synthetic data; returns the state and the output at each sample. */
function run(opts: ThermalSynthOptions) {
  const nom = PACK_NOMINAL[opts.brand];
  const data = synthThermal({ packOhm: PACK_OHM, resolutionC: RES[opts.brand], ...opts });
  let s: ThermalState | null = null;
  const outs: { tS: number; o: ThermalOutput; trueHeat: number; trueTemp: number }[] = [];
  for (const d of data) {
    if (s === null) {
      s = initThermal(d.ts, d.temp, d.ambient, d.current, TEMP_SIGMA_C[opts.brand]);
    } else {
      stepThermal(s, d.ts, d.temp, d.ambient, d.current, PACK_OHM, nom, TEMP_SIGMA_C[opts.brand]);
    }
    outs.push({ tS: d.ts, o: thermalOutput(s, nom), trueHeat: d.trueHeat, trueTemp: d.trueTemp });
  }
  return { data, outs, state: s! };
}

describe('thermal trend (Kalman filter on temperature and unexplained heat)', () => {
  it.each(BRANDS)('explains a healthy pack from load and weather alone, at every vendor cadence (brand %s)', (brand) => {
    const { outs } = run({ brand, durationS: 2400, seed: 11 });
    const settled = outs.filter((x) => x.tS >= 600);
    const worst = Math.max(...settled.map((x) => Math.abs(x.o.unexplainedHeatW)));
    expect(worst).toBeLessThan(AI_CONFIG.thermal.warnW); // never reaches the warning level
    expect(settled.every((x) => x.o.persistenceS === 0)).toBe(true);
  });

  it.each(BRANDS)('recovers a constant 25 W hidden heat source (brand %s, cadence %i s)', (brand) => {
    const { outs } = run({ brand, durationS: 2400, extraHeatW: () => 25, seed: 12 });
    const late = outs.filter((x) => x.tS >= 1500);
    const mean = late.reduce((s, x) => s + x.o.unexplainedHeatW, 0) / late.length;
    expect(Math.abs(mean - 25)).toBeLessThan(6);
    expect(DT_S[brand]).toBeGreaterThan(0);
  });

  it('reports the residual dT/dt as heat / C, in K per minute', () => {
    const { outs, state } = run({ brand: 'A', durationS: 1800, extraHeatW: () => 30, seed: 13 });
    const o = outs[outs.length - 1].o;
    const C = PACK_NOMINAL.A.thermalCapacityJPerK;
    expect(o.residualDTdtKPerMin).toBeCloseTo((state.heat / C) * 60, 9);
    expect(o.measuredDTdtKPerMin).toBeCloseTo(o.expectedDTdtKPerMin + o.residualDTdtKPerMin, 9);
  });

  it('flags a hidden source only after it has persisted, and tracks a growing one', () => {
    const ramp = (t: number) => (t < 600 ? 0 : 0.05 * (t - 600)); // 0 -> 90 W over 30 min
    const { outs } = run({ brand: 'A', durationS: 2400, extraHeatW: ramp, seed: 14 });
    const first = outs.find((x) => x.o.persistenceS >= AI_CONFIG.thermal.persistS);
    expect(first).toBeDefined();
    expect(first!.tS).toBeGreaterThan(600); // never before the source starts
    const late = outs[outs.length - 1];
    expect(late.o.unexplainedHeatW).toBeGreaterThan(0.6 * late.trueHeat); // follows the ramp, with some lag
    expect(late.o.heatRateWPerMin).toBeGreaterThan(0);
  });

  it('keeps up with a fast, accelerating source instead of lagging far behind it', () => {
    // Heat that doubles about every 3.5 minutes, as a tightening internal short does.
    const growth = (t: number) => (t < 300 ? 0 : Math.min(180, 3 * Math.exp((t - 300) / 300)));
    const { outs } = run({ brand: 'A', durationS: 1700, extraHeatW: growth, seed: 18 });
    const point = outs.find((x) => x.trueHeat >= 120)!;
    expect(point).toBeDefined();
    // A filter tuned only for quiet, slowly drifting heat gets to about a quarter of the truth here.
    expect(point.o.unexplainedHeatW).toBeGreaterThan(0.5 * point.trueHeat);
  });

  it('keeps the healthy-pack twin near reality until a fault, then lets the gap open', () => {
    const { outs } = run({ brand: 'A', durationS: 2700, extraHeatW: (t) => (t < 900 ? 0 : 40), seed: 15 });
    const before = outs.find((x) => x.tS >= 880)!;
    expect(Math.abs(before.o.nominalTempC - before.o.tempC)).toBeLessThan(1);
    const after = outs[outs.length - 1];
    expect(after.o.tempC - after.o.nominalTempC).toBeGreaterThan(1.5);
  });

  it('rejects an isolated sensor glitch instead of chasing it', () => {
    const nom = PACK_NOMINAL.A;
    const data = synthThermal({ brand: 'A', durationS: 1200, packOhm: PACK_OHM, seed: 16 });
    let s: ThermalState | null = null;
    let before = 0;
    let after = 0;
    data.forEach((d, i) => {
      const temp = i === 150 ? d.temp + 25 : d.temp; // one wild reading
      if (s === null) s = initThermal(d.ts, temp, d.ambient, d.current, TEMP_SIGMA_C.A);
      else stepThermal(s, d.ts, temp, d.ambient, d.current, PACK_OHM, nom, TEMP_SIGMA_C.A);
      if (i === 149) before = s.heat;
      if (i === 150) after = s.heat;
    });
    expect(Math.abs(after - before)).toBeLessThan(2);
  });
});

describe('time to the 65 degC limit', () => {
  const nom = PACK_NOMINAL.A;
  const tau = nom.thermalCapacityJPerK / nom.thermalConductanceWPerK;

  it('equals the closed-form first-order result when the heat is constant', () => {
    // 50 W of Joule heat + 30 W unexplained at 40 degC ambient settles at 40 + 80/hA.
    const settle = 40 + 80 / nom.thermalConductanceWPerK;
    const t0 = 50;
    const expected = tau * Math.log((settle - t0) / (settle - LIMIT_TEMP_C));
    const got = timeToLimitS(t0, 40, 50, 30, 0, nom, LIMIT_TEMP_C, 20000)!;
    expect(Math.abs(got - expected) / expected).toBeLessThan(0.01);
  });

  it('says "no crossing" when the pack settles below the limit, and 0 once it is past it', () => {
    expect(timeToLimitS(40, 35, 20, 0, 0, nom, LIMIT_TEMP_C)).toBeNull();
    expect(timeToLimitS(66, 35, 20, 0, 0, nom, LIMIT_TEMP_C)).toBe(0);
  });

  it('gives less time the faster the hidden heat is growing, and is never longer than with constant heat', () => {
    // 60 W + 30 W at 40 degC settles at 70 degC, so even the constant-heat case crosses.
    const steady = timeToLimitS(50, 40, 60, 30, 0, nom, LIMIT_TEMP_C)!;
    const slow = timeToLimitS(50, 40, 60, 30, 1 / 1200, nom, LIMIT_TEMP_C)!;
    const fast = timeToLimitS(50, 40, 60, 30, 1 / 300, nom, LIMIT_TEMP_C)!;
    expect(steady).not.toBeNull();
    expect(fast).toBeLessThan(slow);
    expect(slow).toBeLessThan(steady);
  });

  it('reports a finite ETA that shrinks as an accelerating fault approaches the limit', () => {
    const ramp = (t: number) => (t < 300 ? 0 : 3 * Math.exp((t - 300) / 420));
    const { outs } = run({ brand: 'A', durationS: 3000, extraHeatW: ramp, ambientC: 40, startTempC: 46, seed: 17 });
    const crossing = outs.find((x) => x.trueTemp >= LIMIT_TEMP_C);
    expect(crossing).toBeDefined();
    const etaAt = (secondsBefore: number) => outs.find((x) => x.tS >= crossing!.tS - secondsBefore)!.o.etaToLimitS;
    const e10 = etaAt(600);
    const e5 = etaAt(300);
    expect(e10).not.toBeNull();
    expect(e5).not.toBeNull();
    expect(e5!).toBeLessThan(e10!);
    expect(e5!).toBeLessThan(15 * 60); // within a factor of 3 of the real 5 minutes
  });
});

describe('heat-growth fit', () => {
  it('recovers the slope of a linear ramp from irregularly spaced samples', () => {
    const fit = emptyFit();
    let t = 0;
    const gaps = [5, 10, 15, 5, 5, 10, 15];
    for (let i = 0; i < 400; i++) {
      const dt = gaps[i % gaps.length];
      t += dt;
      updateRateFit(fit, dt, 300, 2 + 0.04 * t); // slope 0.04 W/s
    }
    expect(rateOf(fit)).toBeCloseTo(0.04, 3);
  });

  it('returns 0 until it has data spread over time', () => {
    const fit = emptyFit();
    expect(rateOf(fit)).toBe(0);
    updateRateFit(fit, 5, 300, 10);
    expect(rateOf(fit)).toBe(0);
  });
});
