// The AI engine: one track of estimators per battery, fed with canonical Telemetry
// only (never simulator ground truth), producing an Assessment per sample.
// State is plain data, so it can live in a Web Worker and be cloned or saved.
import type { Brand, Telemetry } from '../adapters/schema';
import { RISK_RANK, type RiskLevel } from '../lib/riskLevels';
import { AI_CONFIG } from './config';
import { clamp } from './mathutil';
import { PACK_NOMINAL, TEMP_SIGMA_C } from './nominal';
import {
  impedanceOutput,
  initImpedance,
  packResistanceOhm,
  stepImpedance,
  type ImpedanceState,
} from './impedanceSOH';
import { initOverload, stepOverload, type OverloadState } from './overload';
import { combineRisk, updateLevel } from './riskScore';
import { computeSeverities } from './severity';
import { initThermal, stepThermal, thermalOutput, type ThermalState } from './thermalTrend';
import type { ActionCode, Assessment, RecommendedAction } from './types';
import { initVoltage, stepVoltage, type VoltageState } from './voltageAnomaly';

export interface Track {
  id: string;
  brand: Brand;
  firstTs: number;
  lastTs: number;
  samples: number;
  impedance: ImpedanceState;
  thermal: ThermalState;
  voltage: VoltageState;
  overload: OverloadState;
  level: RiskLevel;
  belowSince: number | null;
  last: Assessment;
}

export interface EngineState {
  tracks: Record<string, Track>;
}

export const createEngine = (): EngineState => ({ tracks: {} });

export const assessmentOf = (engine: EngineState, batteryId: string): Assessment | undefined =>
  engine.tracks[batteryId]?.last;

function packVoltage(t: Telemetry): number {
  let sum = 0;
  for (let i = 0; i < t.cellVoltages.length; i++) sum += t.cellVoltages[i];
  return sum;
}

function newTrack(t: Telemetry, ts: number): Track {
  const nom = PACK_NOMINAL[t.brand];
  const impedance = initImpedance();
  stepImpedance(impedance, ts, packVoltage(t), t.current, t.coreTemp, nom);
  const track: Track = {
    id: t.batteryId,
    brand: t.brand,
    firstTs: ts,
    lastTs: ts,
    samples: 1,
    impedance,
    thermal: initThermal(ts, t.coreTemp, t.ambientTemp, t.current, TEMP_SIGMA_C[t.brand]),
    voltage: initVoltage(ts),
    overload: initOverload(ts, t.current),
    level: 'safe',
    belowSince: null,
    last: undefined as unknown as Assessment,
  };
  stepVoltage(track.voltage, ts, t.cellVoltages, t.current, t.soc);
  return track;
}

/** Feed one canonical telemetry sample; returns the updated assessment of that battery. */
export function ingest(engine: EngineState, t: Telemetry): Assessment {
  const ts = t.ts / 1000;
  const nom = PACK_NOMINAL[t.brand];
  let track = engine.tracks[t.batteryId];

  if (track === undefined || ts - track.lastTs > AI_CONFIG.gapResetS) {
    // First sample, or the device was silent for so long that the old state is stale.
    track = newTrack(t, ts);
    engine.tracks[t.batteryId] = track;
  } else if (ts <= track.lastTs) {
    return track.last; // duplicate or out-of-order sample
  } else {
    stepImpedance(track.impedance, ts, packVoltage(t), t.current, t.coreTemp, nom);
    stepThermal(
      track.thermal,
      ts,
      t.coreTemp,
      t.ambientTemp,
      t.current,
      packResistanceOhm(track.impedance, t.coreTemp, nom),
      nom,
      TEMP_SIGMA_C[t.brand],
    );
    stepVoltage(track.voltage, ts, t.cellVoltages, t.current, t.soc);
    track.lastTs = ts;
    track.samples += 1;
  }

  const observedS = ts - track.firstTs;
  const learning = observedS < AI_CONFIG.warmupS;

  const thermal = thermalOutput(track.thermal, nom);
  const voltage = track.voltage.last;
  const overload = stepOverload(track.overload, ts, t.current, t.coreTemp, nom);
  const impedance = impedanceOutput(track.impedance, nom);

  const confidence = clamp(observedS / AI_CONFIG.fullConfidenceS, 0, 1);
  const severities = computeSeverities(learning, confidence, thermal, voltage, overload, impedance);
  const risk = combineRisk(severities);
  const event = updateLevel(track, risk.score, ts);

  const assessment: Assessment = {
    batteryId: t.batteryId,
    brand: t.brand,
    ts: t.ts,
    learning,
    observedS,
    confidence,
    thermal,
    voltage,
    overload,
    impedance,
    severities,
    risk: { ...risk, level: track.level },
    actions: [],
    event,
  };
  assessment.actions = recommendActions(assessment);
  track.last = assessment;
  return assessment;
}

/** Suggested interventions for the Intervention screen (stage 5 turns these into commands). */
export function recommendActions(a: Assessment): RecommendedAction[] {
  const actions: RecommendedAction[] = [];
  const add = (code: ActionCode, value?: number) => actions.push(value === undefined ? { code } : { code, value });
  const rank = RISK_RANK[a.risk.level];
  const { thermal, voltage, overload } = a.risk.contributions;

  if (a.learning || rank === 0) {
    if (!a.learning && a.impedance.class === 'weak' && a.impedance.confidence >= 0.5) add('schedule_maintenance');
    if (actions.length === 0) add('monitor');
    return actions;
  }

  if (rank >= RISK_RANK.warning) {
    if (thermal + overload > 0) add('derate', Math.max(0.15, a.overload.recommendedDerate));
    add('swap');
    if (voltage >= thermal || rank >= RISK_RANK.danger) add('isolate');
  } else {
    add('monitor');
  }
  if (a.overload.hotCharge || (a.overload.charging && a.overload.ratio > 1)) add('reduce_charge', a.overload.recommendedChargeScale);
  if (a.impedance.class === 'weak' && a.impedance.confidence >= 0.5) add('schedule_maintenance');
  return actions;
}
