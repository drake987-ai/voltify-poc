import { describe, expect, it } from 'vitest';
import { runAB, runTimeline } from '@/eval/timeline';
import { handleRequest, type SimRequest } from '@/workers/protocol';

const specAB = { scenario: 'heatwave43' as const, seed: 202, brand: 'A' as const, durationS: 600 };

describe('simulation worker protocol', () => {
  it('answers a timeline request with exactly what a direct call returns', () => {
    const spec = { ...specAB, mode: 'observe' as const };
    const res = handleRequest({ id: 7, kind: 'timeline', spec });
    expect(res.ok).toBe(true);
    if (res.ok && res.kind === 'timeline') {
      expect(res.id).toBe(7);
      expect(JSON.stringify(res.result)).toBe(JSON.stringify(runTimeline(spec)));
    }
  });

  it('answers an A/B request with both worlds', () => {
    const res = handleRequest({ id: 8, kind: 'ab', spec: specAB });
    expect(res.ok && res.kind === 'ab').toBe(true);
    if (res.ok && res.kind === 'ab') {
      expect(JSON.stringify(res.result)).toBe(JSON.stringify(runAB(specAB)));
      expect(res.result.bms.spec.mode).toBe('bms');
      expect(res.result.voltify.spec.mode).toBe('voltify');
    }
  });

  it('survives a structured clone, as it must to cross the worker boundary', () => {
    const res = handleRequest({ id: 9, kind: 'ab', spec: specAB });
    expect(res.ok).toBe(true);
    expect(() => structuredClone(res)).not.toThrow();
    expect(JSON.stringify(structuredClone(res))).toBe(JSON.stringify(res));
  });

  it('turns a failure into an error response instead of throwing', () => {
    const bad = { id: 10, kind: 'timeline', spec: { ...specAB, mode: 'observe', scenario: 'doesNotExist' } } as unknown as SimRequest;
    const res = handleRequest(bad);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.id).toBe(10);
      expect(res.error.length).toBeGreaterThan(0);
    }
  });
});
