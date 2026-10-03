import { describe, expect, it } from 'vitest';
import { createRng, hashString, mixSeed, nextNormal, nextU, uniformFromKey } from '@/sim';

const draw = (seed: number, n: number) => {
  const r = createRng(seed);
  return Array.from({ length: n }, () => nextU(r));
};

describe('rng', () => {
  it('reproduces the same sequence from the same seed and differs across seeds', () => {
    expect(draw(7, 50)).toEqual(draw(7, 50));
    expect(draw(7, 50)).not.toEqual(draw(8, 50));
  });

  it('draws uniforms in [0, 1) with mean near 0.5', () => {
    const xs = draw(1, 20000);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThan(1);
    expect(xs.reduce((s, x) => s + x, 0) / xs.length).toBeCloseTo(0.5, 1);
  });

  it('draws standard-normal variates (mean ~0, sd ~1)', () => {
    const r = createRng(3);
    const xs = Array.from({ length: 30000 }, () => nextNormal(r));
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length);
    expect(Math.abs(mean)).toBeLessThan(0.03);
    expect(Math.abs(sd - 1)).toBeLessThan(0.03);
  });

  it('consumes exactly two uniforms per normal (constant draw count)', () => {
    const a = createRng(99);
    const b = createRng(99);
    for (let i = 0; i < 10; i++) nextNormal(a);
    for (let i = 0; i < 20; i++) nextU(b);
    expect(a.s).toBe(b.s);
  });

  it('keeps keyed streams independent of call order', () => {
    const first = uniformFromKey(42, 'brand:3');
    uniformFromKey(42, 'brand:9'); // unrelated draw in between
    expect(uniformFromKey(42, 'brand:3')).toBe(first);
    expect(mixSeed(42, 'A-0001')).not.toBe(mixSeed(42, 'A-0002'));
    expect(hashString('x')).toBe(hashString('x'));
  });
});
