import { describe, expect, it } from 'vitest';
import type { Brand } from '@/adapters';
import {
  PACK_NOMINAL,
  classifySoh,
  impedanceOutput,
  initImpedance,
  packResistanceOhm,
  stepImpedance,
  type ImpedanceState,
} from '@/ai';
import { synthPack } from './helpers';

const BRANDS: Brand[] = ['A', 'B', 'C'];

function estimate(brand: Brand, soh: number, tempC = 25, durationS = 3600, seed = 5) {
  const nom = PACK_NOMINAL[brand];
  const s: ImpedanceState = initImpedance();
  for (const d of synthPack({ brand, soh, tempC, durationS, seed })) {
    stepImpedance(s, d.ts, d.voltage, d.current, d.temp, nom);
  }
  return { out: impedanceOutput(s, nom), s, nom };
}

describe('impedance and state of health (RLS)', () => {
  it.each(BRANDS)('recovers SOH to within 1.5 points at every cadence when sampled consistently (brand %s)', (brand) => {
    for (const soh of [0.97, 0.9, 0.82, 0.74, 0.66]) {
      const { out } = estimate(brand, soh);
      expect(Math.abs(out.sohEst - soh), `brand ${brand} soh ${soh}`).toBeLessThan(0.015);
    }
  });

  it('reports the pack resistance referred to 25 degC, in milliohm', () => {
    const { out, nom } = estimate('A', 0.8);
    const expected = nom.r0PackOhm25 * (1 + 4 * 0.2) * 1000;
    expect(Math.abs(out.r25mOhm - expected) / expected).toBeLessThan(0.04);
  });

  it('is not fooled by temperature: the same pack reads the same SOH at 25 and at 50 degC', () => {
    const cool = estimate('A', 0.85, 25).out.sohEst;
    const hot = estimate('A', 0.85, 50).out.sohEst;
    expect(Math.abs(cool - hot)).toBeLessThan(0.02);
    // And the resistance it actually carries at temperature is lower when hot.
    const { s, nom } = estimate('A', 0.85, 50);
    expect(packResistanceOhm(s, 50, nom)).toBeLessThan(packResistanceOhm(s, 25, nom));
  });

  it('learns nothing from steady current (no step, no information) and says so', () => {
    const nom = PACK_NOMINAL.A;
    const s = initImpedance();
    for (let t = 0; t < 600; t += 5) stepImpedance(s, t, 60, 20, 30, nom);
    const out = impedanceOutput(s, nom);
    expect(out.updates).toBe(0);
    expect(out.confidence).toBe(0);
    expect(out.sohEst).toBeCloseTo(0.9, 6); // still the prior
  });

  it('gains confidence with informative updates', () => {
    const early = estimate('A', 0.9, 25, 120).out;
    const late = estimate('A', 0.9, 25, 3600).out;
    expect(late.confidence).toBe(1);
    expect(early.confidence).toBeLessThan(late.confidence);
    expect(late.updates).toBeGreaterThan(early.updates);
  });

  it('classifies packs for routing: good for long routes, weak for short trips or maintenance', () => {
    expect(classifySoh(0.95)).toBe('good');
    expect(classifySoh(0.85)).toBe('good');
    expect(classifySoh(0.8)).toBe('fair');
    expect(classifySoh(0.75)).toBe('fair');
    expect(classifySoh(0.7)).toBe('weak');
  });
});
