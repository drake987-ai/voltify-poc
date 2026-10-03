// Turn each module's raw output into a 0..1 severity. These are the only places
// where thresholds meet evidence, shared by the engine and by the explanations so
// the numbers shown to a user are the numbers that produced the score.
import { AI_CONFIG } from './config';
import { clamp, interpolate, ramp } from './mathutil';
import { LIMIT_TEMP_C } from './nominal';
import type { ImpedanceOutput, OverloadOutput, Severities, ThermalOutput, VoltageOutput } from './types';
import { voltageEvidence } from './voltageAnomaly';

/** 1 at or past the limit, falling to 0 at the last point of the table (90 min). */
export function etaSeverity(etaS: number | null): number {
  if (etaS === null) return 0;
  const points = AI_CONFIG.thermal.etaPointsMin;
  const minutes = etaS / 60;
  return minutes >= points[points.length - 1][0] ? 0 : interpolate(points, minutes);
}

export interface ThermalSeverity {
  /** Unexplained heat, discounted until it has persisted. */
  heat: number;
  /** Projected time to the 65 degC limit. */
  eta: number;
  /** Absolute core temperature. */
  temp: number;
  total: number;
}

/**
 * `confidence` (0..1, learning progress) discounts the time-to-limit term: it comes
 * from the thermal model, which is not trusted until the engine has seen the pack
 * for a while. The measured temperature itself is trusted at once.
 */
export function thermalSeverity(o: ThermalOutput, confidence: number): ThermalSeverity {
  const cfg = AI_CONFIG.thermal;
  const heat = ramp(o.unexplainedHeatW, cfg.warnW, cfg.dangerW) * clamp(o.persistenceS / cfg.persistS, 0, 1);
  const eta = etaSeverity(o.etaToLimitS) * confidence;
  const temp = ramp(o.tempC, cfg.tempWarnC, LIMIT_TEMP_C);
  return { heat, eta, temp, total: Math.max(heat, eta, temp) };
}

export interface VoltageSeverity {
  sag: number;
  drift: number;
  weak: number;
  limit: number;
  total: number;
}

export function voltageSeverity(o: VoltageOutput): VoltageSeverity {
  const ev = voltageEvidence(o);
  const persistence = clamp(o.persistenceS / AI_CONFIG.voltage.persistS, 0, 1);
  const sag = ev.sag * persistence;
  const drift = ev.drift * persistence;
  const weak = ev.weak * persistence;
  return { sag, drift, weak, limit: ev.limit, total: Math.max(sag, drift, weak, ev.limit) };
}

export interface OverloadSeverity {
  crate: number;
  hotCharge: number;
  total: number;
}

export function overloadSeverity(o: OverloadOutput): OverloadSeverity {
  const cfg = AI_CONFIG.overload;
  const crate = ramp(o.ratio, cfg.warnRatio, cfg.dangerRatio);
  const hotCharge = o.charging ? 0.6 * ramp(o.tempC, cfg.hotChargeC, cfg.hotChargeFullC) : 0;
  return { crate, hotCharge, total: Math.max(crate, hotCharge) };
}

export function healthSeverity(o: ImpedanceOutput): number {
  const cfg = AI_CONFIG.impedance;
  return clamp((cfg.healthOkSoh - o.sohEst) / (cfg.healthOkSoh - cfg.healthBadSoh), 0, 1) * o.confidence;
}

/**
 * While the engine is still learning a pack, only directly measured hazards count
 * (absolute temperature, a cell outside its voltage limits, load against the
 * derating curve). Anything that depends on a learned baseline waits.
 */
export function computeSeverities(
  learning: boolean,
  confidence: number,
  thermal: ThermalOutput,
  voltage: VoltageOutput,
  overload: OverloadOutput,
  impedance: ImpedanceOutput,
): Severities {
  const th = thermalSeverity(thermal, confidence);
  const vo = voltageSeverity(voltage);
  return {
    thermal: learning ? th.temp : th.total,
    voltage: learning ? vo.limit : vo.total,
    overload: overloadSeverity(overload).total,
    health: learning ? 0 : healthSeverity(impedance),
  };
}
