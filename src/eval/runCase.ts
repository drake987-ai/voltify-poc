// Evaluation harness: runs the REAL pipeline (simulator -> vendor payload ->
// adapter -> AI engine) and compares what the AI said with what the simulator
// knows. It is the only code that looks at both sides, so it lives apart from
// src/ai (which must never see ground truth). The Evidence screen reuses it.
import { normalize, type Brand } from '../adapters';
import { createEngine, ingest, type Assessment } from '../ai';
import { RISK_RANK, type RiskLevel } from '../lib/riskLevels';
import {
  SIM,
  createFleet,
  findBattery,
  injectFleetFault,
  stepFleet,
  truthOf,
  type FaultSpec,
  type FleetOptions,
} from '../sim';

export interface CaseSpec {
  fleet: FleetOptions;
  /** The battery under study: an id, or the first battery of a brand (default: the first battery). */
  target?: { id?: string; brand?: Brand };
  /** Simulated seconds to run. */
  durationS: number;
  /** Inject an internal short into the target at runtime (after the engine has had time to learn). */
  inject?: { atS: number; fault?: Partial<FaultSpec> };
  /** Lowest risk level that counts as an alert (default "warning"). */
  alertLevel?: RiskLevel;
  /** Record a per-sample trace of the target (for plots and debugging). */
  trace?: boolean;
}

export interface TracePoint {
  tS: number;
  tempMeasured: number;
  tempFiltered: number;
  tempNominal: number;
  heatW: number;
  etaToLimitS: number | null;
  score: number;
  level: RiskLevel;
  contributions: Assessment['risk']['contributions'];
}

export interface BatteryOutcome {
  batteryId: string;
  brand: Brand;
  /** Ground truth: a fault is (or becomes) active in this battery, and when it starts (s). */
  hasFault: boolean;
  faultOnsetS: number | null;
  /** First time the AI reached each level, simulated seconds; null = never. */
  firstWatchS: number | null;
  firstAlertS: number | null;
  firstDangerS: number | null;
  /**
   * First alert whose score comes mostly from heat or cell-voltage evidence (rather than
   * from load or ageing): the fire-safety alert that lead time is measured from.
   */
  firstSafetyAlertS: number | null;
  /** First time the traditional BMS cut the pack off at 65 degC; null = never. */
  bmsTripS: number | null;
  maxScore: number;
  maxCoreTempC: number;
}

export interface CaseResult {
  target: BatteryOutcome;
  /** Seconds between the AI's first alert and the BMS cut-off (positive = the AI was earlier). */
  leadTimeS: number | null;
  /** The same, measured from the first fire-safety alert (heat or cell-voltage driven). */
  safetyLeadTimeS: number | null;
  /** Seconds from the fault starting to the AI's first alert / first fire-safety alert. */
  detectionDelayS: number | null;
  safetyDetectionDelayS: number | null;
  /** Time-to-limit the AI predicted at its first alert vs what really remained until the BMS trip. */
  etaAtAlertS: number | null;
  etaErrorS: number | null;
  /** Every other battery, for false-alarm accounting. */
  others: BatteryOutcome[];
  trace: TracePoint[];
  /** Number of vendor frames rejected by the adapters. */
  rejectedFrames: number;
}

function outcomeOf(id: string, brand: Brand): BatteryOutcome {
  return {
    batteryId: id,
    brand,
    hasFault: false,
    faultOnsetS: null,
    firstWatchS: null,
    firstAlertS: null,
    firstDangerS: null,
    firstSafetyAlertS: null,
    bmsTripS: null,
    maxScore: 0,
    maxCoreTempC: -Infinity,
  };
}

export function runCase(spec: CaseSpec): CaseResult {
  const alertRank = RISK_RANK[spec.alertLevel ?? 'warning'];
  const fleet = createFleet(spec.fleet);
  const engine = createEngine();

  const targetBattery =
    (spec.target?.id !== undefined ? findBattery(fleet, spec.target.id) : undefined) ??
    fleet.batteries.find((b) => spec.target?.brand === undefined || b.config.brand === spec.target.brand) ??
    fleet.batteries[0];
  const targetId = targetBattery.config.id;

  const outcomes = new Map<string, BatteryOutcome>(
    fleet.batteries.map((b) => [b.config.id, outcomeOf(b.config.id, b.config.brand)]),
  );
  const trace: TracePoint[] = [];
  let rejected = 0;
  let injected = false;
  const ticks = Math.round(spec.durationS / SIM.tickS);

  for (let k = 0; k < ticks; k++) {
    if (spec.inject && !injected && fleet.tS >= spec.inject.atS) {
      injectFleetFault(fleet, targetId, { onsetS: spec.inject.atS, ...spec.inject.fault });
      injected = true;
    }
    const step = stepFleet(fleet);

    for (const frame of step.frames) {
      const parsed = normalize(frame.payload);
      if (!parsed.ok) {
        rejected++;
        continue;
      }
      const a = ingest(engine, parsed.value);
      const o = outcomes.get(a.batteryId)!;
      const tS = (a.ts - SIM.epochMs) / 1000;
      const rank = RISK_RANK[a.risk.level];
      if (rank >= RISK_RANK.watch) o.firstWatchS ??= tS;
      if (rank >= alertRank) o.firstAlertS ??= tS;
      if (rank >= RISK_RANK.danger) o.firstDangerS ??= tS;
      const c = a.risk.contributions;
      if (rank >= alertRank && c.thermal + c.voltage >= c.overload + c.health) o.firstSafetyAlertS ??= tS;
      o.maxScore = Math.max(o.maxScore, a.risk.score);
      if (spec.trace && a.batteryId === targetId) {
        trace.push({
          tS,
          tempMeasured: parsed.value.coreTemp,
          tempFiltered: a.thermal.tempC,
          tempNominal: a.thermal.nominalTempC,
          heatW: a.thermal.unexplainedHeatW,
          etaToLimitS: a.thermal.etaToLimitS,
          score: a.risk.score,
          level: a.risk.level,
          contributions: a.risk.contributions,
        });
      }
    }

    // Ground truth, read from the simulator (never given to the AI).
    for (const b of fleet.batteries) {
      const o = outcomes.get(b.config.id)!;
      const t = truthOf(b);
      o.maxCoreTempC = Math.max(o.maxCoreTempC, t.coreTempC);
      if (t.bmsTrippedAtS !== null) o.bmsTripS ??= t.bmsTrippedAtS;
      if (t.faultOnsetS !== null) {
        o.hasFault = true;
        o.faultOnsetS = t.faultOnsetS;
      }
    }
  }

  const target = outcomes.get(targetId)!;
  const others = [...outcomes.values()].filter((o) => o.batteryId !== targetId);
  const leadTimeS = target.firstAlertS !== null && target.bmsTripS !== null ? target.bmsTripS - target.firstAlertS : null;
  const safetyLeadTimeS =
    target.firstSafetyAlertS !== null && target.bmsTripS !== null ? target.bmsTripS - target.firstSafetyAlertS : null;
  const detectionDelayS =
    target.firstAlertS !== null && target.faultOnsetS !== null ? target.firstAlertS - target.faultOnsetS : null;
  const safetyDetectionDelayS =
    target.firstSafetyAlertS !== null && target.faultOnsetS !== null
      ? target.firstSafetyAlertS - target.faultOnsetS
      : null;

  let etaAtAlertS: number | null = null;
  if (spec.trace && target.firstAlertS !== null) {
    etaAtAlertS = trace.find((p) => p.tS >= target.firstAlertS!)?.etaToLimitS ?? null;
  }
  const etaErrorS = etaAtAlertS !== null && leadTimeS !== null ? etaAtAlertS - leadTimeS : null;

  return {
    target,
    leadTimeS,
    safetyLeadTimeS,
    detectionDelayS,
    safetyDetectionDelayS,
    etaAtAlertS,
    etaErrorS,
    others,
    trace,
    rejectedFrames: rejected,
  };
}
