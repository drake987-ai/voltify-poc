// Seedable PRNG. State is a single uint32 inside a plain object so a battery's
// random stream survives structured clone (Web Worker) and can be reproduced.

export interface Rng {
  s: number;
}

/** FNV-1a, 32 bit. */
export function hashString(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Derive an independent stream seed from a global seed and a key (e.g. a battery id). */
export function mixSeed(seed: number, key: string): number {
  return hashString(`${seed >>> 0}:${key}`);
}

export function createRng(seed: number): Rng {
  return { s: seed >>> 0 };
}

/** mulberry32: uniform in [0, 1). Consumes exactly one state step. */
export function nextU(r: Rng): number {
  r.s = (r.s + 0x6d2b79f5) >>> 0;
  let t = r.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * Standard normal via Box-Muller. Always consumes exactly two uniforms (the
 * second variate is discarded rather than cached) so the number of draws per
 * call is constant. That is what lets two runs with and without an injected
 * fault stay bit-identical until the fault starts.
 */
export function nextNormal(r: Rng): number {
  const u1 = Math.max(nextU(r), 1e-12);
  const u2 = nextU(r);
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export const uniform = (r: Rng, lo: number, hi: number): number => lo + (hi - lo) * nextU(r);

export const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);

/** One stateless uniform in [0, 1) from (seed, key); order-independent. */
export function uniformFromKey(seed: number, key: string): number {
  return nextU(createRng(mixSeed(seed, key)));
}
