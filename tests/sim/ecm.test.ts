import { describe, expect, it } from 'vitest';
import { CELL, OCV_TABLE, ocv, r0Factor, stepRc, terminalVoltage } from '@/sim';

describe('open-circuit voltage', () => {
  it('spans 3.0 V (empty) to 4.2 V (full), clamps outside 0..1, and rises monotonically', () => {
    expect(ocv(0)).toBeCloseTo(3.0, 9);
    expect(ocv(1)).toBeCloseTo(4.2, 9);
    expect(ocv(-0.5)).toBe(ocv(0));
    expect(ocv(1.5)).toBe(ocv(1));
    let prev = -Infinity;
    for (let s = 0; s <= 1.0001; s += 0.01) {
      const v = ocv(s);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it('interpolates linearly between table points', () => {
    const [[s0, v0], [s1, v1]] = [OCV_TABLE[3], OCV_TABLE[4]];
    expect(ocv((s0 + s1) / 2)).toBeCloseTo((v0 + v1) / 2, 9);
  });
});

describe('1-RC equivalent circuit', () => {
  const r0 = 0.0032;
  const r1 = CELL.r1Ratio * r0;
  const current = 20;

  it('terminal voltage equals OCV at zero current and zero polarisation', () => {
    expect(terminalVoltage(3.8, 0, r0, 0)).toBe(3.8);
  });

  it('instantaneous drop is I*R0; steady-state drop is I*(R0+R1)', () => {
    expect(terminalVoltage(3.8, current, r0, 0)).toBeCloseTo(3.8 - current * r0, 12);
    let vRc = 0;
    for (let i = 0; i < 400; i++) vRc = stepRc(vRc, r1, current, 5); // 2000 s = 50 tau
    expect(vRc).toBeCloseTo(r1 * current, 9);
    expect(terminalVoltage(3.8, current, r0, vRc)).toBeCloseTo(3.8 - current * (r0 + r1), 9);
  });

  it('step response reaches 63.2 % of its final value after one time constant', () => {
    const vRc = stepRc(0, r1, current, CELL.tauRcS);
    expect(vRc / (r1 * current)).toBeCloseTo(1 - Math.exp(-1), 9);
  });

  it('is exact for any step length (one long step equals many short ones)', () => {
    let fine = 0;
    for (let i = 0; i < 100; i++) fine = stepRc(fine, r1, current, 0.5);
    expect(stepRc(0, r1, current, 50)).toBeCloseTo(fine, 10);
  });
});

describe('R0 temperature and age dependence', () => {
  it('is 1 at 25 degC and 100 % SOH', () => {
    expect(r0Factor(25, 1)).toBeCloseTo(1, 12);
  });

  it('falls as the cell warms', () => {
    expect(r0Factor(45, 1)).toBeLessThan(r0Factor(25, 1));
    expect(r0Factor(25, 1)).toBeLessThan(r0Factor(5, 1));
  });

  it('rises as the cell ages, by 1 + gamma (1 - SOH)', () => {
    expect(r0Factor(25, 0.8) / r0Factor(25, 1)).toBeCloseTo(1 + CELL.ageResistanceGamma * 0.2, 12);
    expect(r0Factor(25, 0.7)).toBeGreaterThan(r0Factor(25, 0.9));
  });
});
