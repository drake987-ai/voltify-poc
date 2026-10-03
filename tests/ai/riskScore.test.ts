import { describe, expect, it } from 'vitest';
import {
  AI_CONFIG,
  combineRisk,
  entryThreshold,
  levelFromScore,
  updateLevel,
  type LevelTracker,
  type Severities,
} from '@/ai';
import type { RiskLevel } from '@/lib/riskLevels';

const zero: Severities = { thermal: 0, voltage: 0, overload: 0, health: 0 };
const sum = (c: Severities) => c.thermal + c.voltage + c.overload + c.health;

describe('Risk Score (weighted noisy-OR)', () => {
  it('is 0 with no evidence and stays within 0..100 with all of it', () => {
    expect(combineRisk(zero).score).toBe(0);
    const all = combineRisk({ thermal: 1, voltage: 1, overload: 1, health: 1 }).score;
    expect(all).toBeGreaterThan(95);
    expect(all).toBeLessThanOrEqual(100);
  });

  it('gives each module the maximum it can reach alone', () => {
    const w = AI_CONFIG.risk.weights;
    expect(combineRisk({ ...zero, thermal: 1 }).score).toBeCloseTo(100 * w.thermal, 9);
    expect(combineRisk({ ...zero, voltage: 1 }).score).toBeCloseTo(100 * w.voltage, 9);
    expect(combineRisk({ ...zero, overload: 1 }).score).toBeCloseTo(100 * w.overload, 9);
    expect(combineRisk({ ...zero, health: 1 }).score).toBeCloseTo(100 * w.health, 9);
  });

  it('lets thermal or voltage evidence alone reach "danger", but not overload or ageing alone', () => {
    const level = (s: Severities) => levelFromScore(combineRisk(s).score);
    expect(level({ ...zero, thermal: 1 })).toBe('danger');
    expect(level({ ...zero, voltage: 1 })).toBe('danger');
    expect(level({ ...zero, overload: 1 })).not.toBe('warning');
    expect(level({ ...zero, overload: 1 })).not.toBe('danger');
    expect(level({ ...zero, health: 1 })).toBe('watch');
  });

  it('is monotone in every severity, and combining signals scores more than either alone', () => {
    for (const key of ['thermal', 'voltage', 'overload', 'health'] as const) {
      let prev = -1;
      for (let s = 0; s <= 1.0001; s += 0.1) {
        const score = combineRisk({ ...zero, [key]: Math.min(s, 1) }).score;
        expect(score).toBeGreaterThanOrEqual(prev);
        prev = score;
      }
    }
    const a = combineRisk({ ...zero, thermal: 0.5 }).score;
    const b = combineRisk({ ...zero, voltage: 0.5 }).score;
    const both = combineRisk({ ...zero, thermal: 0.5, voltage: 0.5 }).score;
    expect(both).toBeGreaterThan(Math.max(a, b));
    expect(both).toBeLessThan(a + b + 1e-9); // sub-additive: never double-counts
  });

  it('splits the score exactly into per-module contributions that always sum to it', () => {
    const cases: Severities[] = [
      zero,
      { thermal: 0.3, voltage: 0.1, overload: 0.9, health: 0.4 },
      { thermal: 1, voltage: 1, overload: 1, health: 1 },
      { thermal: 0.05, voltage: 0, overload: 0, health: 0.2 },
    ];
    for (const sev of cases) {
      const r = combineRisk(sev);
      expect(sum(r.contributions)).toBeCloseTo(r.score, 9);
      for (const key of Object.keys(sev) as (keyof Severities)[]) {
        if (sev[key] === 0) expect(r.contributions[key]).toBe(0);
        expect(r.contributions[key]).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('levels', () => {
  it('map scores to the four levels at 25 / 50 / 75', () => {
    const at = (x: number) => levelFromScore(x);
    expect([at(0), at(24.9), at(25), at(49.9), at(50), at(74.9), at(75), at(100)]).toEqual([
      'safe',
      'safe',
      'watch',
      'watch',
      'warning',
      'warning',
      'danger',
      'danger',
    ]);
    expect(entryThreshold('safe')).toBe(0);
    expect(entryThreshold('warning')).toBe(50);
  });

  it('go up at once but come down only after a sustained drop (no flicker at a boundary)', () => {
    const t: LevelTracker = { level: 'safe', belowSince: null };
    expect(updateLevel(t, 55, 0)).toEqual({ from: 'safe', to: 'warning' });
    // Hovering just under the entry threshold (50) does not change anything.
    for (let s = 5; s <= 600; s += 5) expect(updateLevel(t, 48 + (s % 4), s)).toBeNull();
    expect(t.level).toBe('warning');
    // A real drop must last the dwell time before the level falls.
    expect(updateLevel(t, 30, 700)).toBeNull();
    expect(updateLevel(t, 30, 730)).toBeNull();
    expect(updateLevel(t, 30, 700 + AI_CONFIG.risk.dwellS)).toEqual({ from: 'warning', to: 'watch' });
    // A brief recovery resets the timer.
    const u: LevelTracker = { level: 'danger', belowSince: null };
    updateLevel(u, 40, 0);
    updateLevel(u, 80, 30);
    expect(updateLevel(u, 40, 40 + AI_CONFIG.risk.dwellS - 1)).toBeNull();
    expect(u.level).toBe('danger');
  });

  it('records a rise through several levels as one change', () => {
    const t: LevelTracker = { level: 'safe', belowSince: null };
    expect(updateLevel(t, 90, 0)).toEqual({ from: 'safe' as RiskLevel, to: 'danger' as RiskLevel });
  });
});
