// Scenarios (CLAUDE.md section 5). A scenario is data: a fleet-wide weather part
// (`env`, used when it is the fleet's scenario) and a per-battery part (load,
// health, weak cell, fault) that can also be applied to a single battery.
//
// Scenarios are deliberately orthogonal: e.g. `internalShort` changes nothing
// but the fault, so a run with it and a run without it are identical until the
// fault starts (the basis of the A/B comparison on screen 3).
import type { LoadProfile, Mode } from './battery';
import { FAULT } from './params';

export const SCENARIO_IDS = [
  'baseline',
  'heatwave43',
  'heavyClimb',
  'cellImbalance',
  'internalShort',
  'agedHigh',
  'overheatLoad',
  'escalatingShort',
  'severeHeatLoad',
  'hotCabinet',
] as const;
export type ScenarioId = (typeof SCENARIO_IDS)[number];

export interface ScenarioSpec {
  /** A scenario id, or ids joined with "+" for a composed scenario. */
  id: string;
  /** Air temperature profile (fleet-wide; ignored when applied to a single battery). */
  env?: { ambientMinC: number; ambientMaxC: number };
  load?: Partial<LoadProfile>;
  /** Initial state of health (otherwise drawn from the fleet distribution). */
  soh?: number;
  /** Initial SOC range (default 0.35..0.95). */
  socRange?: readonly [number, number];
  /** Initial core temperature above the surrounding air, degC. */
  coreTempAboveAmbientC?: number;
  /** Multiplier on the pack's heat conductance hA: below 1 = poor cooling (sealed compartment in the sun). */
  coolingScale?: number;
  /** What the pack is doing when the run starts (default: riding). */
  startMode?: Mode;
  /** One cell group with lower capacity and higher resistance. */
  weakCell?: { capScale: number; r0Scale: number; cell?: number };
  /** Internal soft short; `onsetS` is seconds after the battery starts. */
  fault?: { cell?: number; onsetS: number; rShortOhm0: number; rShortMinOhm: number; tauS: number };
}

/**
 * One scenario, or several composed (later ones win field by field; `load` merges key by key), or a
 * scenario written out in full (the Sandbox builds these from its sliders).
 */
export type ScenarioSelection = ScenarioId | readonly ScenarioId[] | ScenarioSpec;

export function resolveScenario(selection: ScenarioSelection): ScenarioSpec {
  if (typeof selection === 'object' && !Array.isArray(selection)) {
    const spec = selection as ScenarioSpec;
    return { ...spec, ...(spec.load ? { load: { ...spec.load } } : {}) };
  }
  const ids: readonly ScenarioId[] = typeof selection === 'string' ? [selection] : (selection as readonly ScenarioId[]);
  const out: ScenarioSpec = { id: ids.join('+') };
  for (const id of ids) {
    const s = SCENARIOS[id];
    if (s.env) out.env = s.env;
    if (s.load) out.load = { ...out.load, ...s.load };
    if (s.soh !== undefined) out.soh = s.soh;
    if (s.socRange) out.socRange = s.socRange;
    if (s.coreTempAboveAmbientC !== undefined) out.coreTempAboveAmbientC = s.coreTempAboveAmbientC;
    if (s.coolingScale !== undefined) out.coolingScale = s.coolingScale;
    if (s.startMode !== undefined) out.startMode = s.startMode;
    if (s.weakCell) out.weakCell = s.weakCell;
    if (s.fault) out.fault = s.fault;
  }
  return out;
}

/** Ordinary hot-season day in a Vietnamese city. */
export const BASE_ENV = { ambientMinC: 27, ambientMaxC: 35 } as const;

export const SCENARIOS: Record<ScenarioId, ScenarioSpec> = {
  baseline: { id: 'baseline' },
  /** Nắng nóng 43 degC: the afternoon peak of the day reaches 43 degC air temperature. */
  heatwave43: { id: 'heatwave43', env: { ambientMinC: 31, ambientMaxC: 43 } },
  /** Chở nặng + leo dốc: heavy cargo and sustained 6 % climbs a third of the time. */
  heavyClimb: {
    id: 'heavyClimb',
    load: { payloadKg: 70, climbGrade: 0.06, climbDuty: 0.35 },
  },
  /** Cell mất cân bằng: one cell group with 18 % less capacity and 1.7x the resistance. */
  cellImbalance: { id: 'cellImbalance', weakCell: { capScale: 0.82, r0Scale: 1.7 } },
  /** Đoản mạch ngầm bắt đầu: a soft internal short starting 10 minutes in. */
  internalShort: {
    id: 'internalShort',
    fault: { onsetS: 600, rShortOhm0: FAULT.rShortOhm0, rShortMinOhm: FAULT.rShortMinOhm, tauS: FAULT.tauS },
  },
  /** Pin chai cao: SOH 72 % (internal resistance about 2.1x new). */
  agedHigh: { id: 'agedHigh', soh: 0.72 },
  /**
   * Quá tải + pin chai + nắng nóng: the load-driven "worst day". Aged pack (SOH 72 %),
   * 80 kg cargo and 7 % climbs half the time, 43 degC afternoon, a pack sealed in a
   * compartment in the sun (hA x0.45), starting warm from a hot charging cabinet, and no
   * stop for charging (so the trace is not cut by a swap).
   *
   * These are deliberately adverse settings (a worst day, not a typical one). Physical
   * note: on its own this rarely reaches the 65 degC BMS limit (2 of 60 packs did in a
   * 90 min run), because a pack has limited energy and its resistance falls as it warms.
   * Reaching the limit reliably takes a fault on top: compose with `escalatingShort`.
   */
  overheatLoad: {
    id: 'overheatLoad',
    env: { ambientMinC: 31, ambientMaxC: 43 },
    load: { payloadKg: 80, climbGrade: 0.07, climbDuty: 0.5, speedScale: 1.15, autoCharge: false },
    soh: 0.72,
    socRange: [0.92, 0.98],
    coreTempAboveAmbientC: 10,
    coolingScale: 0.45,
  },
  /** A soft short that tightens within minutes rather than hours (5 min onset, R 20 ohm down to 0.08 ohm). */
  escalatingShort: {
    id: 'escalatingShort',
    fault: { onsetS: 300, rShortOhm0: 20, rShortMinOhm: 0.08, tauS: 300 },
  },
  /**
   * The load-driven hero of the BMS-vs-Voltify screen: no fault at all, only a very hard
   * day. Aged pack (SOH 70 %), 100 kg of cargo, 8 % climbs 60 % of the time, a pace 25 %
   * above normal, 43 degC afternoon, and a pack sealed in a sun-baked compartment (hA x0.25).
   * Chosen so the traditional BMS trips in most runs (the demo seed trips for all three
   * brands) while a power cut plus a pack swap keeps the pack below 65 degC in every run
   * tried. Because the heating is load-driven, removing the load truly stops the rise; an
   * internal short would not (see `escalatingShort`). Deliberately severe, not typical.
   */
  severeHeatLoad: {
    id: 'severeHeatLoad',
    env: { ambientMinC: 31, ambientMaxC: 43 },
    load: { payloadKg: 100, climbGrade: 0.08, climbDuty: 0.6, speedScale: 1.25, autoCharge: false },
    soh: 0.7,
    socRange: [0.92, 0.98],
    coreTempAboveAmbientC: 8,
    coolingScale: 0.25,
  },
  /**
   * An aged pack put on fast charge (1 C) in a crowded swap cabinet on a hot afternoon: the
   * cabinet air is 46-50 degC and the stacked pack sheds heat poorly (hA x0.5). Used by the
   * charging-cabinet screen to compare full-rate charging with a current reduced by the AI.
   */
  hotCabinet: {
    id: 'hotCabinet',
    env: { ambientMinC: 46, ambientMaxC: 50 },
    load: { chargeCRate: 1.0 },
    soh: 0.78,
    socRange: [0.1, 0.12],
    coreTempAboveAmbientC: 4,
    coolingScale: 0.5,
    startMode: 'charging',
  },
};
