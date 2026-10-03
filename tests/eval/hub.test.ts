import { describe, expect, it } from 'vitest';
import { BRANDS, CANONICAL_FIELDS, FIELD_MAP, detectBrand, locate, normalize, type Brand } from '@/adapters';
import { HUB_SPEC, runHub } from '@/eval/hub';
import { BRAND_SPECS, SIM } from '@/sim';

const run = runHub();

describe('cross-brand hub run', () => {
  it('has one pack per brand, each reporting at its own cadence for the whole run', () => {
    for (const b of BRANDS) {
      const s = run.streams[b];
      expect(s.brand).toBe(b);
      expect(s.batteryId.startsWith(`${b}-`)).toBe(true);
      expect(s.intervalS).toBe(BRAND_SPECS[b].emitEveryTicks * SIM.tickS);
      expect(s.frames.length).toBe(Math.floor(HUB_SPEC.durationS / s.intervalS));
    }
    expect(run.streams.A.intervalS).toBeLessThan(run.streams.B.intervalS);
    expect(run.streams.B.intervalS).toBeLessThan(run.streams.C.intervalS);
  });

  it('is told apart by shape alone, and every payload is understood (no adapter errors)', () => {
    for (const b of BRANDS) {
      const s = run.streams[b];
      expect(s.adapterErrors).toBe(0);
      for (const f of s.frames) {
        expect(detectBrand(f.raw)).toBe(b);
        const again = normalize(f.raw);
        expect(again.ok).toBe(true);
        if (again.ok) expect(again.value).toEqual(f.telemetry);
      }
    }
  });

  it('speaks three different wire formats: different sizes, same canonical schema', () => {
    const size = (b: Brand) => run.streams[b].meanBytes;
    // C is a positional array (compact), A flat JSON, B nested JSON with longer names.
    expect(size('C')).toBeLessThan(size('A'));
    expect(size('A')).toBeLessThan(size('B'));
    const keys = (b: Brand) => Object.keys(run.streams[b].frames[0].telemetry).sort();
    expect(keys('A')).toEqual(keys('B'));
    expect(keys('B')).toEqual(keys('C'));
    expect(JSON.stringify(run.streams.A.frames[0].raw)).not.toBe(JSON.stringify(run.streams.B.frames[0].raw));
  });

  it('judges the same bad afternoon the same way whichever brand reports it', () => {
    const alerts = BRANDS.map((b) => run.streams[b].alertS);
    for (const a of alerts) expect(a).not.toBeNull();
    const times = alerts as number[];
    // Different cadences (5, 10, 15 s) shift the alert by a few frames, not by minutes.
    expect(Math.max(...times) - Math.min(...times)).toBeLessThanOrEqual(60);
  });

  it('loses no more than half a quantisation step per format on the way (validation against the sensor reading)', () => {
    const f = (b: Brand) => run.streams[b].fidelity;
    for (const b of ['A', 'B'] as const) {
      expect(f(b).coreTempC.max).toBeLessThanOrEqual(0.05 + 1e-9);
      expect(f(b).currentA.max).toBeLessThanOrEqual(0.05 + 1e-9);
      expect(f(b).socPct.max).toBeLessThanOrEqual(0.05 + 1e-9);
      expect(f(b).cellMv.max).toBeLessThanOrEqual(0.5 + 1e-9);
    }
    // C is coarser: 0.5 degC, whole percent, cells rebuilt from the pack voltage and offsets.
    expect(f('C').coreTempC.max).toBeLessThanOrEqual(0.25 + 1e-9);
    expect(f('C').coreTempC.max).toBeGreaterThan(f('A').coreTempC.max);
    expect(f('C').socPct.max).toBeLessThanOrEqual(0.5 + 1e-9);
    expect(f('C').cellMv.max).toBeLessThanOrEqual(1.0);
    expect(f('C').cellMv.max).toBeGreaterThan(f('A').cellMv.max);
  });

  it('is deterministic', () => {
    expect(JSON.stringify(runHub())).toBe(JSON.stringify(run));
  });
});

describe('field map', () => {
  it('describes every canonical field for every brand', () => {
    for (const b of BRANDS) {
      expect(Object.keys(FIELD_MAP[b]).sort()).toEqual([...CANONICAL_FIELDS].sort());
    }
  });

  it('points only at fields that exist in real payloads of that brand', () => {
    for (const b of BRANDS) {
      const raw = run.streams[b].frames[5].raw;
      for (const field of CANONICAL_FIELDS) {
        for (const path of FIELD_MAP[b][field].paths) {
          expect(locate(raw, path), `${b}.${field} -> ${path}`).not.toBeUndefined();
        }
      }
    }
  });

  it('locates nested and positional values', () => {
    expect(locate({ a: { b: [1, 2] } }, 'a.b')).toEqual([1, 2]);
    expect(locate(['x', 7], '[1]')).toBe(7);
    expect(locate({ a: 1 }, 'a.b.c')).toBeUndefined();
    expect(locate(null, 'a')).toBeUndefined();
  });
});
