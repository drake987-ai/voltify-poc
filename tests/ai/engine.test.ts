import { describe, expect, it } from 'vitest';
import { normalize, type Telemetry } from '@/adapters';
import {
  AI_CONFIG,
  createEngine,
  explainAssessment,
  ingest,
  type Assessment,
  type EngineState,
} from '@/ai';
import { createFleet, injectFleetFault, stepFleet, type FleetOptions } from '@/sim';

/** Canonical telemetry the AI would receive: simulator -> vendor payload -> adapter. */
function telemetryStream(options: FleetOptions, ticks: number, faultAtS?: number): Telemetry[] {
  const fleet = createFleet(options);
  const out: Telemetry[] = [];
  for (let k = 0; k < ticks; k++) {
    if (faultAtS !== undefined && fleet.tS === faultAtS) {
      injectFleetFault(fleet, fleet.batteries[0].config.id, { rShortOhm0: 20, rShortMinOhm: 0.08, tauS: 300 });
    }
    for (const f of stepFleet(fleet).frames) {
      const res = normalize(f.payload);
      if (res.ok) out.push(res.value);
    }
  }
  return out;
}

const feed = (engine: EngineState, stream: Telemetry[]) => stream.map((t) => ingest(engine, t));
const sumContrib = (a: Assessment) => a.risk.contributions.thermal + a.risk.contributions.voltage + a.risk.contributions.overload + a.risk.contributions.health;

describe('engine bookkeeping', () => {
  const stream = telemetryStream({ seed: 301, n: 6 }, 240);

  it('is deterministic: the same stream gives identical assessments', () => {
    const a = feed(createEngine(), stream);
    const b = feed(createEngine(), stream);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('keeps plain data state: a structured clone continues exactly like the original', () => {
    const half = Math.floor(stream.length / 2);
    const original = createEngine();
    feed(original, stream.slice(0, half));
    const clone = structuredClone(original);
    const a = feed(original, stream.slice(half));
    const b = feed(clone, stream.slice(half));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('ignores duplicate and out-of-order samples', () => {
    const engine = createEngine();
    const [first, second] = stream.filter((t) => t.batteryId === stream[0].batteryId);
    const a1 = ingest(engine, first);
    ingest(engine, second);
    const samples = engine.tracks[first.batteryId].samples;
    expect(ingest(engine, second)).toBe(engine.tracks[first.batteryId].last); // duplicate
    expect(ingest(engine, first)).toBe(engine.tracks[first.batteryId].last); // older than the last one
    expect(engine.tracks[first.batteryId].samples).toBe(samples);
    expect(a1.batteryId).toBe(first.batteryId);
  });

  it('starts over after a long silence instead of trusting stale state', () => {
    const engine = createEngine();
    const own = stream.filter((t) => t.batteryId === stream[0].batteryId);
    for (const t of own.slice(0, 80)) ingest(engine, t);
    const late = { ...own[80], ts: own[79].ts + (AI_CONFIG.gapResetS + 60) * 1000 };
    const a = ingest(engine, late);
    expect(a.observedS).toBe(0);
    expect(a.learning).toBe(true);
  });

  it('does not raise alerts while it is still learning a pack, and says so', () => {
    const a = feed(createEngine(), stream).filter((x) => x.observedS < AI_CONFIG.warmupS);
    expect(a.length).toBeGreaterThan(20);
    expect(a.every((x) => x.learning && x.risk.level === 'safe')).toBe(true);
  });

  it('produces finite, in-range numbers with contributions that sum to the score', () => {
    for (const a of feed(createEngine(), stream)) {
      expect(a.risk.score).toBeGreaterThanOrEqual(0);
      expect(a.risk.score).toBeLessThanOrEqual(100);
      expect(sumContrib(a)).toBeCloseTo(a.risk.score, 9);
      expect(a.confidence).toBeGreaterThanOrEqual(0);
      expect(a.confidence).toBeLessThanOrEqual(1);
      for (const x of [a.thermal.tempC, a.thermal.unexplainedHeatW, a.voltage.spreadMv, a.overload.ratio, a.impedance.sohEst]) {
        expect(Number.isFinite(x)).toBe(true);
      }
    }
  });

  it('reports a level change exactly once, on the sample where it happens', () => {
    const faulty = telemetryStream({ seed: 301, n: 4 }, 720, 600).filter((t) => t.batteryId === 'A-0001' || t.batteryId.endsWith('0001'));
    const engine = createEngine();
    let prev = 'safe';
    let changes = 0;
    for (const a of feed(engine, faulty)) {
      if (a.event) {
        changes++;
        expect(a.event.from).toBe(prev);
        expect(a.event.to).toBe(a.risk.level);
        prev = a.risk.level;
      } else {
        expect(a.risk.level).toBe(prev);
      }
    }
    expect(changes).toBeGreaterThan(0);
  });
});

describe('explanations (Explainable AI)', () => {
  const faulty = telemetryStream({ seed: 302, n: 4 }, 900, 900);
  const target = faulty.filter((t) => t.batteryId.endsWith('0001'));
  const assessments = feed(createEngine(), target);
  const alerting = assessments.filter((a) => a.risk.score >= 50);

  it('has alerts to explain', () => {
    expect(alerting.length).toBeGreaterThan(10);
  });

  it('attributes the whole Risk Score to signals, most responsible first', () => {
    for (const a of alerting) {
      const ex = explainAssessment(a);
      expect(ex.length).toBeGreaterThan(0);
      expect(ex.reduce((s, e) => s + e.points, 0)).toBeCloseTo(a.risk.score, 6);
      for (let i = 1; i < ex.length; i++) expect(ex[i - 1].points).toBeGreaterThanOrEqual(ex[i].points);
    }
  });

  it('states for each signal its value, the threshold where it counts, and a 0..1 confidence', () => {
    const last = alerting[alerting.length - 1];
    for (const e of explainAssessment(last)) {
      expect(e.confidence).toBeGreaterThanOrEqual(0);
      expect(e.confidence).toBeLessThanOrEqual(1);
      expect(e.severity).toBeGreaterThan(0);
      expect(e.severity).toBeLessThanOrEqual(1);
      expect(Number.isFinite(e.threshold)).toBe(true);
      expect(['above', 'below']).toContain(e.direction);
      if (e.module === 'voltage' && e.signal !== 'cell_voltage_limit') expect(e.cell).toBeGreaterThanOrEqual(0);
    }
  });

  it('while learning, cites only directly measured signals', () => {
    const early = assessments.find((a) => a.learning && a.thermal.tempC > 0)!;
    const modelled = new Set(['unexplained_heat', 'eta_to_limit', 'cell_sag', 'cell_drift', 'weak_cell', 'low_soh']);
    for (const e of explainAssessment(early)) expect(modelled.has(e.signal)).toBe(false);
  });

  it('names the heat signal among the reasons once a short is heating the pack', () => {
    const last = alerting[alerting.length - 1];
    const signals = explainAssessment(last).map((e) => e.signal);
    expect(signals.some((s) => s === 'unexplained_heat' || s === 'cell_sag' || s === 'cell_drift' || s === 'eta_to_limit')).toBe(true);
  });
});

describe('throughput', () => {
  it('processes frames fast enough for 2,000 batteries at 60x speed with wide margin', () => {
    const stream = telemetryStream({ seed: 9, n: 200 }, 120);
    const engine = createEngine();
    const t0 = performance.now();
    for (const t of stream) ingest(engine, t);
    const usPerFrame = ((performance.now() - t0) * 1000) / stream.length;
    // 2,000 batteries at 60x need roughly 16,000 frames/s, i.e. up to 62 us per frame on one core.
    // Measured around 5 us; this bound only guards against an order-of-magnitude regression.
    expect(usPerFrame).toBeLessThan(40);
  });
});
