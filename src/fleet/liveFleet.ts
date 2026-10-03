// The live demo fleet: the same plan run twice, once with Voltify (AI + intervention
// policy) and once as a counterfactual "shadow" with the traditional BMS only. Because
// every battery evolves independently and deterministically, the two fleets are
// identical until Voltify acts, so comparing them counts the incidents that really were
// prevented rather than guessing. The state is plain data and the module has no browser
// or worker API, so it runs identically in a worker, on the main thread and in tests.
import { normalize, type Brand, type Telemetry } from '../adapters';
import { createEngine, computeVitals, explainAssessment, ingest, type Assessment, type EngineState, type SignalCode, type Vitals } from '../ai';
import { createIntervention, stepIntervention, type InterventionEvent, type InterventionState } from '../intervention';
import { RISK_LEVELS, RISK_RANK, type RiskLevel } from '../lib/riskLevels';
import {
  NO_CONTROL,
  SIM,
  createFleet,
  injectFleetFault,
  stepFleet,
  truthOf,
  type BatteryControl,
  type FleetState,
} from '../sim';
import { incidentSavings } from '../business/assumptions';
import { buildFleetPlan, type FleetConfig, type FleetPlan, type FleetRole } from './plan';

export interface AlertRecord {
  tS: number;
  id: string;
  brand: Brand;
  level: RiskLevel;
  score: number;
  /** The signal that contributes most to the score, for a one-line reason. */
  topSignal: SignalCode | null;
}

export interface LiveFleet {
  plan: FleetPlan;
  fleet: FleetState;
  shadow: FleetState;
  engine: EngineState;
  assessments: (Assessment | undefined)[];
  latest: (Telemetry | undefined)[];
  /** AI-reported discharge-performance score per battery, 0..100 (0 until known). */
  perf: Uint8Array;
  interventions: (InterventionState | undefined)[];
  controls: Record<string, BatteryControl>;
  alerts: AlertRecord[];
  alertsTotal: number;
  nextFault: number;
}

/** Index-aligned description of the fleet that never changes during a run. */
export interface FleetLayout {
  n: number;
  ids: string[];
  /** 0 = A, 1 = B, 2 = C. */
  brands: Uint8Array;
  /** 0 = TP.HCM, 1 = Ha Noi. */
  cities: Uint8Array;
}

export interface FleetKpis {
  /** Packs at each risk level: safe, watch, warning, danger. */
  levelCounts: [number, number, number, number];
  /** Packs the AI is still learning (counted in "safe" until it has seen them for a few minutes). */
  learning: number;
  /** Mean state of health estimated by the AI, percent (over packs it has learned). */
  meanSoh: number;
  alertsTotal: number;
  /** Packs the intervention has swapped out. */
  swaps: number;
  /** Packs whose BMS cut the power, with Voltify and in the counterfactual BMS-only fleet. */
  bmsTripsVoltify: number;
  bmsTripsBaseline: number;
  /** Incidents prevented: the BMS-only fleet had to cut this pack off, the Voltify one did not. */
  prevented: number;
  /** Estimated saving (VND) from the default assumptions. */
  savingsVnd: number;
}

export interface SelectedDetail {
  id: string;
  index: number;
  brand: Brand;
  role: FleetRole;
  telemetry: Telemetry;
  assessment: Assessment;
  vitals: Vitals;
  events: InterventionEvent[];
}

export interface FleetSnapshot {
  tS: number;
  lat: Float32Array;
  lng: Float32Array;
  /** 0..3 = safe, watch, warning, danger. */
  level: Uint8Array;
  score: Uint8Array;
  soc: Uint8Array;
  soh: Uint8Array;
  perf: Uint8Array;
  temp: Float32Array;
  /** bit 0 learning, bit 1 power cut active, bit 2 swapped out, bit 3 BMS has cut off. */
  flags: Uint8Array;
  kpis: FleetKpis;
  alerts: AlertRecord[];
  selected: SelectedDetail | null;
}

export const FLAG_LEARNING = 1;
export const FLAG_DERATING = 2;
export const FLAG_SWAPPED = 4;
export const FLAG_TRIPPED = 8;

const BRAND_INDEX: Record<Brand, number> = { A: 0, B: 1, C: 2 };
const MAX_ALERTS = 120;

export function createLiveFleet(config: FleetConfig): LiveFleet {
  const plan = buildFleetPlan(config);
  const fleet = createFleet(plan.options);
  const shadow = createFleet(plan.options);
  const n = fleet.batteries.length;
  return {
    plan,
    fleet,
    shadow,
    engine: createEngine(),
    assessments: new Array<Assessment | undefined>(n),
    latest: fleet.batteries.map((b) => b.reading),
    perf: new Uint8Array(n),
    interventions: new Array<InterventionState | undefined>(n),
    controls: {},
    alerts: [],
    alertsTotal: 0,
    nextFault: 0,
  };
}

export function layoutOf(live: LiveFleet): FleetLayout {
  const bs = live.fleet.batteries;
  return {
    n: bs.length,
    ids: bs.map((b) => b.config.id),
    brands: Uint8Array.from(bs, (b) => BRAND_INDEX[b.config.brand]),
    cities: Uint8Array.from(bs, (b) => (b.config.city === 'hcmc' ? 0 : 1)),
  };
}

const indexOf = (id: string): number => Number.parseInt(id.slice(2), 10) - 1;

/** Advance the whole demo by one physics tick (5 simulated seconds). */
export function tickLive(live: LiveFleet): void {
  const { fleet, shadow, plan } = live;

  // Scheduled internal shorts hit both worlds at the same moment.
  while (live.nextFault < plan.faults.length && plan.faults[live.nextFault].atS <= fleet.tS) {
    const f = plan.faults[live.nextFault++];
    injectFleetFault(fleet, f.id, { onsetS: fleet.tS, ...f.fault });
    injectFleetFault(shadow, f.id, { onsetS: shadow.tS, ...f.fault });
  }

  stepFleet(shadow); // the counterfactual: nobody acts
  const step = stepFleet(fleet, live.controls);

  for (const frame of step.frames) {
    const parsed = normalize(frame.payload);
    if (!parsed.ok) continue;
    const t = parsed.value;
    const idx = indexOf(t.batteryId);
    const a = ingest(live.engine, t);
    live.assessments[idx] = a;
    live.latest[idx] = t;
    live.perf[idx] = a.learning ? 0 : Math.round(computeVitals(a, t).discharge.score);

    if (a.event && RISK_RANK[a.event.to] >= RISK_RANK.warning && RISK_RANK[a.event.to] > RISK_RANK[a.event.from]) {
      live.alertsTotal++;
      live.alerts.push({
        tS: (t.ts - SIM.epochMs) / 1000,
        id: t.batteryId,
        brand: t.brand,
        level: a.event.to,
        score: a.risk.score,
        topSignal: explainAssessment(a)[0]?.signal ?? null,
      });
      if (live.alerts.length > MAX_ALERTS) live.alerts.shift();
    }

    // The intervention starts at the first alert, and is kept up from then on.
    let state = live.interventions[idx];
    if (!state && RISK_RANK[a.risk.level] >= RISK_RANK[plan.config.policy.alertLevel]) {
      state = live.interventions[idx] = createIntervention();
    }
    if (state) {
      const control = stepIntervention(
        state,
        { tS: (t.ts - SIM.epochMs) / 1000, level: a.risk.level, lat: t.lat, lng: t.lng, city: fleet.batteries[idx].config.city },
        plan.config.policy,
      );
      if (control.derate > 0 || control.parked) live.controls[t.batteryId] = control;
      else delete live.controls[t.batteryId];
    }
  }
}

export function advanceLive(live: LiveFleet, ticks: number): void {
  for (let i = 0; i < ticks; i++) tickLive(live);
}

function kpisOf(live: LiveFleet): FleetKpis {
  const { fleet, shadow } = live;
  const levelCounts: [number, number, number, number] = [0, 0, 0, 0];
  let learning = 0;
  let sohSum = 0;
  let sohN = 0;
  let swaps = 0;
  let tripsV = 0;
  let tripsB = 0;
  let prevented = 0;
  for (let i = 0; i < fleet.batteries.length; i++) {
    const a = live.assessments[i];
    if (a) {
      levelCounts[RISK_RANK[a.risk.level]]++;
      if (a.learning) learning++;
      else {
        sohSum += a.impedance.sohEst;
        sohN++;
      }
    } else {
      levelCounts[0]++;
      learning++;
    }
    const s = live.interventions[i];
    if (s && s.swapAtS !== null && s.swapAtS <= fleet.tS) swaps++;
    const tripped = fleet.batteries[i].bmsTrippedAtS !== null;
    const shadowTripped = shadow.batteries[i].bmsTrippedAtS !== null;
    if (tripped) tripsV++;
    if (shadowTripped) tripsB++;
    if (shadowTripped && !tripped) prevented++;
  }
  return {
    levelCounts,
    learning,
    meanSoh: sohN > 0 ? (100 * sohSum) / sohN : Number.NaN,
    alertsTotal: live.alertsTotal,
    swaps,
    bmsTripsVoltify: tripsV,
    bmsTripsBaseline: tripsB,
    prevented,
    savingsVnd: incidentSavings(prevented).totalVnd,
  };
}

/** Everything the screens need to know about one battery. */
export function detailOf(live: LiveFleet, id: string): SelectedDetail | null {
  const index = indexOf(id);
  const b = live.fleet.batteries[index];
  const a = live.assessments[index];
  const t = live.latest[index];
  if (!b || b.config.id !== id || !a || !t) return null;
  return {
    id,
    index,
    brand: b.config.brand,
    role: live.plan.roles[id] ?? 'normal',
    telemetry: t,
    assessment: a,
    vitals: computeVitals(a, t),
    events: live.interventions[index]?.events.map((e) => ({ ...e })) ?? [],
  };
}

export function snapshotOf(live: LiveFleet, selectedId: string | null = null): FleetSnapshot {
  const { fleet } = live;
  const n = fleet.batteries.length;
  const lat = new Float32Array(n);
  const lng = new Float32Array(n);
  const level = new Uint8Array(n);
  const score = new Uint8Array(n);
  const soc = new Uint8Array(n);
  const soh = new Uint8Array(n);
  const temp = new Float32Array(n);
  const flags = new Uint8Array(n);

  for (let i = 0; i < n; i++) {
    const t = live.latest[i];
    const a = live.assessments[i];
    if (t) {
      lat[i] = t.lat;
      lng[i] = t.lng;
      soc[i] = Math.round(t.soc * 100);
      temp[i] = t.coreTemp;
    }
    let f = 0;
    if (a) {
      level[i] = RISK_RANK[a.risk.level];
      score[i] = Math.round(a.risk.score);
      soh[i] = a.learning ? 0 : Math.round(a.impedance.sohEst * 100);
      if (a.learning) f |= FLAG_LEARNING;
    } else f |= FLAG_LEARNING;
    const c = live.controls[fleet.batteries[i].config.id] ?? NO_CONTROL;
    if (c.derate > 0) f |= FLAG_DERATING;
    if (c.parked) f |= FLAG_SWAPPED;
    if (fleet.batteries[i].bmsTripped) f |= FLAG_TRIPPED;
    flags[i] = f;
  }

  return {
    tS: fleet.tS,
    lat,
    lng,
    level,
    score,
    soc,
    soh,
    perf: live.perf.slice(),
    temp,
    flags,
    kpis: kpisOf(live),
    alerts: live.alerts.slice(-30),
    selected: selectedId ? detailOf(live, selectedId) : null,
  };
}

/** Pack counts by level for quick tests and legends. */
export const LEVEL_NAMES = RISK_LEVELS;

/** True state of one battery's trouble, for the demo's own explanation of why it is flagged. */
export const truthSummary = (live: LiveFleet, id: string) => truthOf(live.fleet.batteries[indexOf(id)]);
