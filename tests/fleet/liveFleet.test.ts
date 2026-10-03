import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FLEET_CONFIG,
  FLAG_DERATING,
  FLAG_LEARNING,
  FLAG_SWAPPED,
  ROLE_SHARES,
  advanceLive,
  buildFleetPlan,
  createLiveFleet,
  detailOf,
  layoutOf,
  liveTwinSpec,
  snapshotOf,
  type FleetRole,
} from '@/fleet';
import { incidentSavings } from '@/business/assumptions';
import { runTimeline } from '@/eval/timeline';
import { CITY_BOX, truthOf } from '@/sim';

const CONFIG = { ...DEFAULT_FLEET_CONFIG, n: 300 };
const TICKS_40_MIN = 480;

const plan = buildFleetPlan(CONFIG);
const live = createLiveFleet(CONFIG);
advanceLive(live, TICKS_40_MIN);
const snap = snapshotOf(live);
const layout = layoutOf(live);

const idsOf = (role: FleetRole) => Object.entries(plan.roles).filter(([, r]) => r === role).map(([id]) => id);
const indexOf = (id: string) => Number.parseInt(id.slice(2), 10) - 1;

describe('fleet plan', () => {
  it('is deterministic from the seed and different for another seed', () => {
    expect(JSON.stringify(buildFleetPlan(CONFIG))).toBe(JSON.stringify(plan));
    expect(JSON.stringify(buildFleetPlan({ ...CONFIG, seed: 7 }).roles)).not.toBe(JSON.stringify(plan.roles));
  });

  it('gives every battery a role and keeps most of the fleet normal', () => {
    expect(Object.keys(plan.roles)).toHaveLength(300);
    const share = (role: FleetRole) => idsOf(role).length / 300;
    expect(share('normal')).toBeGreaterThan(0.75);
    for (const r of Object.keys(ROLE_SHARES) as (keyof typeof ROLE_SHARES)[]) {
      expect(share(r), r).toBeGreaterThan(0);
      expect(share(r), r).toBeLessThan(ROLE_SHARES[r] + 0.05);
    }
  });

  it('schedules each short once, in time order, between 10 and 90 minutes in', () => {
    const faults = plan.faults;
    expect(faults.length).toBe(idsOf('short').length);
    for (let i = 1; i < faults.length; i++) expect(faults[i].atS).toBeGreaterThanOrEqual(faults[i - 1].atS);
    for (const f of faults) {
      expect(f.atS).toBeGreaterThanOrEqual(600);
      expect(f.atS).toBeLessThanOrEqual(5400);
      expect(plan.roles[f.id]).toBe('short');
    }
  });

  it('scales the same story to a bigger fleet without changing the first 300 batteries', () => {
    const big = buildFleetPlan({ ...CONFIG, n: 2000 });
    for (const id of Object.keys(plan.roles)) expect(big.roles[id]).toBe(plan.roles[id]);
  });
});

describe('live fleet snapshot', () => {
  it('describes every battery in index-aligned arrays', () => {
    expect(layout.n).toBe(300);
    expect(layout.ids).toHaveLength(300);
    for (const arr of [snap.lat, snap.lng, snap.level, snap.score, snap.soc, snap.soh, snap.perf, snap.temp, snap.flags]) {
      expect(arr).toHaveLength(300);
    }
    expect(snap.tS).toBe(TICKS_40_MIN * 5);
  });

  it('keeps every vehicle inside its city and every level in range', () => {
    for (let i = 0; i < layout.n; i++) {
      const box = CITY_BOX[layout.cities[i] === 0 ? 'hcmc' : 'hanoi'];
      expect(snap.lat[i]).toBeGreaterThan(box.latMin - 0.001);
      expect(snap.lat[i]).toBeLessThan(box.latMax + 0.001);
      expect(snap.lng[i]).toBeGreaterThan(box.lngMin - 0.001);
      expect(snap.lng[i]).toBeLessThan(box.lngMax + 0.001);
      expect(snap.level[i]).toBeLessThanOrEqual(3);
      expect(snap.soc[i]).toBeLessThanOrEqual(100);
    }
    expect(new Set(layout.cities)).toEqual(new Set([0, 1]));
    expect(new Set(layout.brands)).toEqual(new Set([0, 1, 2]));
  });

  it('counts the packs at each level and they add up to the fleet', () => {
    const k = snap.kpis;
    expect(k.levelCounts.reduce((s, x) => s + x, 0)).toBe(300);
    for (let l = 0; l < 4; l++) expect(k.levelCounts[l]).toBe(snap.level.filter((x) => x === l).length);
    expect(k.meanSoh).toBeGreaterThan(80);
    expect(k.meanSoh).toBeLessThan(100);
  });

  it('is deterministic: the same run twice gives the same snapshot', () => {
    const again = createLiveFleet(CONFIG);
    advanceLive(again, TICKS_40_MIN);
    const a = snapshotOf(again);
    expect(Array.from(a.level)).toEqual(Array.from(snap.level));
    expect(Array.from(a.score)).toEqual(Array.from(snap.score));
    expect(Array.from(a.lat)).toEqual(Array.from(snap.lat));
    expect(JSON.stringify(a.kpis)).toBe(JSON.stringify(snap.kpis));
  });
});

describe('Voltify against the counterfactual BMS-only fleet (same seed)', () => {
  it('prevents BMS cut-offs that the traditional BMS could not, and counts exactly those', () => {
    const k = snap.kpis;
    expect(k.bmsTripsBaseline).toBeGreaterThan(0);
    expect(k.prevented).toBeGreaterThan(0);
    expect(k.bmsTripsVoltify).toBeLessThan(k.bmsTripsBaseline);
    // Recount independently from the simulators' own records.
    let prevented = 0;
    for (let i = 0; i < 300; i++) {
      if (live.shadow.batteries[i].bmsTrippedAtS !== null && live.fleet.batteries[i].bmsTrippedAtS === null) prevented++;
    }
    expect(k.prevented).toBe(prevented);
  });

  it('only the hard-load packs needed it: normal packs behave identically in both worlds, bit for bit', () => {
    for (const id of idsOf('normal').slice(0, 60)) {
      const i = indexOf(id);
      expect(live.fleet.batteries[i].coreTempC).toBe(live.shadow.batteries[i].coreTempC);
      expect(JSON.stringify(live.fleet.batteries[i].reading)).toBe(JSON.stringify(live.shadow.batteries[i].reading));
    }
  });

  it('puts a severe pack through the full plan: alert, power cut, shipper told, swap', () => {
    const swapped = idsOf('severe').filter((id) => live.interventions[indexOf(id)]?.swapAtS !== null && live.interventions[indexOf(id)] !== undefined);
    expect(swapped.length).toBeGreaterThan(0);
    const d = detailOf(live, swapped[0])!;
    expect(d.role).toBe('severe');
    expect(d.events.map((e) => e.kind)).toEqual(['ai_alert', 'derate_sent', 'shipper_notified', 'swap_done']);
    expect(snap.flags[d.index] & FLAG_SWAPPED).toBeTruthy();
    expect(snap.flags[d.index] & FLAG_DERATING).toBeTruthy();
  });

  it('turns the prevented count into money by the stated formula', () => {
    const k = snap.kpis;
    expect(k.savingsVnd).toBe(incidentSavings(k.prevented).totalVnd);
    expect(k.savingsVnd).toBeGreaterThan(0);
    const s = incidentSavings(2, { packCostVnd: 10, packDamageFraction: 0.5, strandedCostVnd: 3, rideTempC: 40, efcPerDay: 1, chargeShare: 0.5 });
    expect(s.packLossAvoidedVnd).toBe(10);
    expect(s.strandedAvoidedVnd).toBe(6);
    expect(s.totalVnd).toBe(16);
  });
});

describe('scheduled faults and alerts', () => {
  it('injects each short at its planned time into both worlds', () => {
    const f = plan.faults[0];
    const i = indexOf(f.id);
    const early = createLiveFleet(CONFIG);
    advanceLive(early, Math.floor(f.atS / 5) - 2);
    expect(early.fleet.batteries[i].fault).toBeNull();
    expect(early.shadow.batteries[i].fault).toBeNull();
    advanceLive(early, 4);
    expect(early.fleet.batteries[i].fault).not.toBeNull();
    expect(early.shadow.batteries[i].fault).not.toBeNull();
    expect(truthOf(early.fleet.batteries[i]).faultOnsetS).toBeGreaterThanOrEqual(f.atS - 10);
  });

  it('lists alerts newest last, each with a level, score and a reason', () => {
    expect(snap.alerts.length).toBeGreaterThan(0);
    for (let i = 1; i < snap.alerts.length; i++) expect(snap.alerts[i].tS).toBeGreaterThanOrEqual(snap.alerts[i - 1].tS);
    for (const a of snap.alerts) {
      expect(['warning', 'danger']).toContain(a.level);
      expect(a.score).toBeGreaterThanOrEqual(50);
      expect(a.topSignal).not.toBeNull();
    }
    expect(snap.kpis.alertsTotal).toBeGreaterThanOrEqual(snap.alerts.length);
  });

  it('marks packs as learning only at the very start', () => {
    const fresh = createLiveFleet(CONFIG);
    advanceLive(fresh, 20);
    const s = snapshotOf(fresh);
    expect(Array.from(s.flags).filter((f) => f & FLAG_LEARNING).length).toBeGreaterThan(200);
    expect(Array.from(snap.flags).filter((f) => f & FLAG_LEARNING).length).toBe(0);
  });
});

describe('selected battery detail', () => {
  it('carries the assessment, the four vital signs and the intervention log of one battery', () => {
    const id = idsOf('severe')[0];
    const withSel = snapshotOf(live, id);
    const d = withSel.selected!;
    expect(d.id).toBe(id);
    expect(d.assessment.batteryId).toBe(id);
    expect(d.vitals.safety.score).toBe(d.assessment.risk.score);
    expect(d.telemetry.batteryId).toBe(id);
    expect(snapshotOf(live, 'Z-9999').selected).toBeNull();
  });
});

describe('replaying one pack of the live fleet (the Digital Twin link)', () => {
  const ids = (role: FleetRole) => idsOf(role).slice(0, 2);

  it.each([...ids('severe'), ...ids('short'), ...ids('normal')])(
    'reproduces exactly what the live fleet showed for %s',
    (id) => {
      const replay = liveTwinSpec(CONFIG, id, TICKS_40_MIN * 5)!;
      expect(replay).not.toBeNull();
      const t = runTimeline(replay.spec);
      const last = t.frames[t.frames.length - 1];
      const d = detailOf(live, id)!;
      // The live fleet may hold a frame from a slower brand's cadence; compare the frame at the same time.
      const same = t.frames.find((f) => f.telemetry.ts === d.telemetry.ts)!;
      expect(same, `no replay frame at ${d.telemetry.ts}`).toBeDefined();
      expect(same.telemetry.coreTemp).toBe(d.telemetry.coreTemp);
      expect(same.telemetry.current).toBe(d.telemetry.current);
      expect(same.telemetry.cellVoltages).toEqual(d.telemetry.cellVoltages);
      expect(same.assessment!.risk.score).toBe(d.assessment.risk.score);
      expect(last.tS).toBeLessThanOrEqual(TICKS_40_MIN * 5);
    },
  );

  it('carries the pack role into the replay and nothing else', () => {
    const [severe] = ids('severe');
    const [short] = ids('short');
    const [normal] = ids('normal');
    expect(liveTwinSpec(CONFIG, severe)!.spec.overrides).toEqual({ [severe]: ['severeHeatLoad'] });
    expect(liveTwinSpec(CONFIG, short)!.spec.inject?.atS).toBe(plan.faults.find((f) => f.id === short)!.atS);
    expect(liveTwinSpec(CONFIG, normal)!.spec.overrides).toBeUndefined();
    expect(liveTwinSpec(CONFIG, normal)!.spec.inject).toBeUndefined();
  });

  it('does not invent packs the fleet does not have', () => {
    expect(liveTwinSpec(CONFIG, 'Z-0001')).toBeNull();
    expect(liveTwinSpec(CONFIG, 'A-9999')).toBeNull();
  });
});
