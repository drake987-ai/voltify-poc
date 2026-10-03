// End-to-end validation of the AI against simulator ground truth, through the real
// pipeline (simulator -> vendor payloads -> adapters -> engine). All seeds here
// (301-303) are different from the ones the thresholds were tuned on (201-203).
import { describe, expect, it } from 'vitest';
import { normalize, type Brand } from '@/adapters';
import { createEngine, ingest } from '@/ai';
import { runCase } from '@/eval/runCase';
import { createFleet, stepFleet, truthOf, type ScenarioSelection } from '@/sim';

const BRANDS: Brand[] = ['A', 'B', 'C'];
const WORST_DAY: ScenarioSelection = ['overheatLoad', 'escalatingShort'];
const SHORT = { rShortOhm0: 20, rShortMinOhm: 0.08, tauS: 300 };
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

describe('no false alarms on healthy fleets', () => {
  it.each(['baseline', 'heatwave43', 'heavyClimb', 'agedHigh'] as const)(
    '%s: no battery reaches "warning" in 75 minutes',
    (scenario) => {
      const r = runCase({ fleet: { seed: 301, n: 40, scenario }, durationS: 4500 });
      const flagged = [r.target, ...r.others].filter((o) => o.firstAlertS !== null).map((o) => o.batteryId);
      expect(flagged).toEqual([]);
      expect(r.rejectedFrames).toBe(0);
    },
  );
});

describe('a developing internal short, injected after the engine has learned the pack', () => {
  it.each(BRANDS)('is caught as a fire-safety alert 5-30 minutes after it starts (brand %s)', (brand) => {
    const r = runCase({
      fleet: { seed: 301, n: 24 },
      target: { brand },
      durationS: 4500,
      inject: { atS: 1200, fault: SHORT },
    });
    expect(r.target.hasFault).toBe(true);
    expect(r.target.faultOnsetS).toBe(1200);
    expect(r.safetyDetectionDelayS).not.toBeNull();
    expect(r.safetyDetectionDelayS!).toBeGreaterThan(5 * 60);
    expect(r.safetyDetectionDelayS!).toBeLessThan(30 * 60);
    // It is seen at "watch" before it becomes an alert, and the alert before "danger".
    expect(r.target.firstWatchS!).toBeLessThanOrEqual(r.target.firstAlertS!);
    expect(r.target.firstAlertS!).toBeLessThanOrEqual(r.target.firstDangerS!);
    // ... without raising a single false alert on the 23 healthy batteries around it.
    expect(r.others.filter((o) => o.firstAlertS !== null)).toEqual([]);
  });

  it('is found about as fast whichever vendor the pack belongs to', () => {
    const delays = BRANDS.map(
      (brand) =>
        runCase({ fleet: { seed: 302, n: 24 }, target: { brand }, durationS: 4500, inject: { atS: 1200, fault: SHORT } })
          .safetyDetectionDelayS!,
    );
    expect(Math.max(...delays) - Math.min(...delays)).toBeLessThan(5 * 60);
  });
});

describe('worst day: the AI against the traditional BMS (same scenario, same seed)', () => {
  const cases = [301, 302].flatMap((seed) =>
    BRANDS.map((brand) => ({
      seed,
      brand,
      result: runCase({ fleet: { seed, n: 24, scenario: WORST_DAY }, target: { brand }, durationS: 3000, trace: true }),
    })),
  );

  it('the BMS does trip in every case (so there is something to be early against)', () => {
    for (const c of cases) expect(c.result.target.bmsTripS, `${c.seed}/${c.brand}`).not.toBeNull();
  });

  it('the AI raises a fire-safety alert well before the BMS cuts off, in every case', () => {
    for (const c of cases) {
      expect(c.result.safetyLeadTimeS, `${c.seed}/${c.brand}`).not.toBeNull();
      expect(c.result.safetyLeadTimeS!, `${c.seed}/${c.brand}`).toBeGreaterThan(15 * 60);
    }
  });

  it('the measured lead time averages over 20 minutes (the 30-45 min target is NOT claimed)', () => {
    const lead = mean(cases.map((c) => c.result.safetyLeadTimeS! / 60));
    expect(lead).toBeGreaterThan(20);
    // Honest bound: on this simulator it comes out in the mid-to-high 20s of minutes, below the target.
    expect(lead).toBeLessThan(40);
  });

  it('reaches "danger" before the BMS cut-off too', () => {
    for (const c of cases) expect(c.result.target.firstDangerS!).toBeLessThan(c.result.target.bmsTripS!);
  });

  it('the live time-to-limit is finite and within a factor of 4 five minutes before the trip, and shrinks toward it', () => {
    for (const c of cases) {
      const trip = c.result.target.bmsTripS!;
      const at = (before: number) => c.result.trace.find((p) => p.tS >= trip - before)!.etaToLimitS;
      const eta5 = at(300);
      expect(eta5, `${c.seed}/${c.brand}`).not.toBeNull();
      expect(eta5!).toBeLessThan(20 * 60);
      expect(eta5!).toBeGreaterThan(60);
      const eta10 = at(600);
      if (eta10 !== null) expect(eta5!).toBeLessThan(eta10 + 60);
    }
  });
});

describe('state of health against simulator truth', () => {
  const fleet = createFleet({ seed: 301, n: 90 });
  const engine = createEngine();
  for (let k = 0; k < 720; k++) {
    for (const f of stepFleet(fleet).frames) {
      const p = normalize(f.payload);
      if (p.ok) ingest(engine, p.value);
    }
  }
  const errorsOf = (brand: Brand) =>
    fleet.batteries
      .filter((b) => b.config.brand === brand)
      .map((b) => engine.tracks[b.config.id].last.impedance.sohEst - truthOf(b).soh);
  const mae = (xs: number[]) => mean(xs.map(Math.abs));

  it('is within 1 point on average for brand A (5 s cadence), 2 for B (10 s) and 3 for C (15 s)', () => {
    // Sparser sampling loses the current history between two samples, so accuracy depends on the vendor.
    expect(mae(errorsOf('A'))).toBeLessThan(0.01);
    expect(mae(errorsOf('B'))).toBeLessThan(0.02);
    expect(mae(errorsOf('C'))).toBeLessThan(0.03);
  });

  it('classifies most packs into the right routing class (good / fair / weak)', () => {
    const cls = (soh: number) => (soh >= 0.85 ? 'good' : soh >= 0.75 ? 'fair' : 'weak');
    const right = fleet.batteries.filter((b) => engine.tracks[b.config.id].last.impedance.class === cls(truthOf(b).soh)).length;
    expect(right / fleet.batteries.length).toBeGreaterThan(0.8);
  });

  it('puts a pack that is truly aged at the weak end', () => {
    const aged = createFleet({ seed: 301, n: 30, scenario: 'agedHigh' });
    const e = createEngine();
    for (let k = 0; k < 720; k++) {
      for (const f of stepFleet(aged).frames) {
        const p = normalize(f.payload);
        if (p.ok) ingest(e, p.value);
      }
    }
    const est = aged.batteries.map((b) => e.tracks[b.config.id].last.impedance.sohEst);
    expect(mean(est)).toBeLessThan(0.76);
    expect(mean(est)).toBeGreaterThan(0.68);
  });
});

describe('weak cell versus leaking cell', () => {
  it('names the truly weak cell in a fleet where each pack has one', () => {
    const fleet = createFleet({ seed: 301, n: 40, scenario: 'cellImbalance' });
    const engine = createEngine();
    for (let k = 0; k < 540; k++) {
      for (const f of stepFleet(fleet).frames) {
        const p = normalize(f.payload);
        if (p.ok) ingest(engine, p.value);
      }
    }
    // In this scenario the weak cell is each battery's own `faultCell` candidate (simulator ground truth).
    const found = fleet.batteries.filter((b) => {
      const a = engine.tracks[b.config.id].last;
      return a.voltage.weakCell === b.config.faultCell;
    }).length;
    expect(found / fleet.batteries.length).toBeGreaterThan(0.8);
  });
});
