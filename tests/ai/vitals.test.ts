import { describe, expect, it } from 'vitest';
import { normalize } from '@/adapters';
import { DISCHARGE_WEIGHTS, PACK_NOMINAL, computeVitals, createEngine, ingest, type Assessment } from '@/ai';
import type { Telemetry } from '@/adapters';
import { createFleet, stepFleet, truthOf, type ScenarioSelection } from '@/sim';

/** Run a fleet and return, for each battery, its last telemetry and assessment. */
function observe(scenario: ScenarioSelection, seed: number, n: number, ticks: number) {
  const fleet = createFleet({ seed, n, scenario });
  const engine = createEngine();
  const latest = new Map<string, { t: Telemetry; a: Assessment }>();
  for (let k = 0; k < ticks; k++) {
    for (const f of stepFleet(fleet).frames) {
      const p = normalize(f.payload);
      if (p.ok) latest.set(p.value.batteryId, { t: p.value, a: ingest(engine, p.value) });
    }
  }
  return { fleet, latest };
}

const healthy = observe('baseline', 301, 30, 540);
const aged = observe('agedHigh', 301, 30, 540);
const weak = observe('cellImbalance', 301, 30, 540);
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
const vitalsOf = (o: ReturnType<typeof observe>) => [...o.latest.values()].map(({ t, a }) => computeVitals(a, t));

describe('vital sign 1: charge left', () => {
  it('reports the SOC in percent and the riding time left at the recent load', () => {
    for (const { t, a } of healthy.latest.values()) {
      const v = computeVitals(a, t);
      expect(v.soc.pct).toBeCloseTo(t.soc * 100, 9);
      if (v.soc.remainingMin !== null) {
        const nom = PACK_NOMINAL[a.brand];
        const expected = ((t.soc * nom.capacityAh * a.impedance.sohEst) / (a.overload.cRateRms * nom.capacityAh)) * 60;
        expect(v.soc.remainingMin).toBeCloseTo(expected, 6);
      }
    }
  });

  it('asks for a swap when the pack is nearly flat, not before', () => {
    const { t, a } = [...healthy.latest.values()][0];
    // Plenty of charge: a swap is called for only if the recent load would still drain it within 15 min.
    const full = computeVitals(a, { ...t, soc: 0.9 }).soc;
    expect(full.swapSoon).toBe(full.remainingMin !== null && full.remainingMin < 15);
    // Under 20 % is always the moment to swap.
    expect(computeVitals(a, { ...t, soc: 0.15 }).soc.swapSoon).toBe(true);
    // More charge never means less time left.
    const low = computeVitals(a, { ...t, soc: 0.3 }).soc;
    if (low.remainingMin !== null && full.remainingMin !== null) expect(full.remainingMin).toBeGreaterThan(low.remainingMin);
  });
});

describe('vital sign 2: health', () => {
  it('maps the health class to routing advice: good packs go far, weak ones stay close', () => {
    const advice = new Map(vitalsOf(aged).map((v) => [v.health.class, v.health.route]));
    for (const [cls, route] of advice) expect(route).toBe(cls === 'good' ? 'long' : cls === 'fair' ? 'medium' : 'short');
    const all = [...vitalsOf(healthy), ...vitalsOf(aged)];
    expect(new Set(all.map((v) => v.health.route)).size).toBeGreaterThan(1);
  });

  it('puts the aged fleet well below the healthy fleet', () => {
    expect(mean(vitalsOf(aged).map((v) => v.health.pct))).toBeLessThan(mean(vitalsOf(healthy).map((v) => v.health.pct)) - 8);
  });
});

describe('vital sign 3: safety and fire risk', () => {
  it('carries the Risk Score, its level and the forecast time to the limit unchanged', () => {
    for (const { t, a } of healthy.latest.values()) {
      const v = computeVitals(a, t);
      expect(v.safety.score).toBe(a.risk.score);
      expect(v.safety.level).toBe(a.risk.level);
      expect(v.safety.etaMin).toBe(a.thermal.etaToLimitS === null ? null : a.thermal.etaToLimitS / 60);
    }
  });
});

describe('vital sign 4: discharge performance', () => {
  it('weights the three penalties so that a perfect pack scores 100 and the weights sum to 1', () => {
    expect(DISCHARGE_WEIGHTS.resistance + DISCHARGE_WEIGHTS.weakCell + DISCHARGE_WEIGHTS.balance).toBeCloseTo(1, 12);
    for (const v of vitalsOf(healthy)) {
      const d = v.discharge;
      expect(d.score).toBeCloseTo(
        100 * (1 - DISCHARGE_WEIGHTS.resistance * d.resistancePenalty - DISCHARGE_WEIGHTS.weakCell * d.weakCellPenalty - DISCHARGE_WEIGHTS.balance * d.balancePenalty),
        9,
      );
      expect(d.score).toBeGreaterThan(0);
      expect(d.score).toBeLessThanOrEqual(100);
    }
  });

  it('scores aged packs (high resistance) and weak-cell packs lower than healthy ones', () => {
    const base = mean(vitalsOf(healthy).map((v) => v.discharge.score));
    expect(mean(vitalsOf(aged).map((v) => v.discharge.score))).toBeLessThan(base - 8);
    expect(mean(vitalsOf(weak).map((v) => v.discharge.score))).toBeLessThan(base - 3);
  });

  it('attributes the weak-cell fleet to the weak cell and recommends balancing, not an emergency', () => {
    const vs = vitalsOf(weak);
    expect(mean(vs.map((v) => v.discharge.weakCellPenalty))).toBeGreaterThan(0.3);
    expect(vs.some((v) => v.discharge.needsBalancing)).toBe(true);
  });

  it('computes efficiency from the pack resistance and the current drawn, and only when loaded', () => {
    for (const { t, a } of healthy.latest.values()) {
      const d = computeVitals(a, t).discharge;
      if (t.current > 2) {
        expect(d.efficiencyPct).not.toBeNull();
        expect(d.efficiencyPct!).toBeGreaterThan(80);
        expect(d.efficiencyPct!).toBeLessThanOrEqual(100);
        expect(d.lossW).toBeGreaterThan(0);
      } else {
        expect(d.efficiencyPct).toBeNull();
      }
    }
  });

  it('tracks simulator truth: the aged fleet really has higher true resistance than the healthy one', () => {
    const r = (o: ReturnType<typeof observe>) => mean(o.fleet.batteries.map((b) => truthOf(b).r0PackOhm));
    expect(r(aged)).toBeGreaterThan(r(healthy));
  });
});
