// Module 3: sustained current beyond what the pack can carry at its temperature.
// The allowed continuous C-rate falls as the pack heats (a derating curve), so the
// same current that is fine at 30 degC is an overload at 55 degC.
import { AI_CONFIG } from './config';
import { clamp, interpolate, smoothingWeight } from './mathutil';
import type { PackNominal } from './nominal';
import type { OverloadOutput } from './types';

export interface OverloadState {
  ts: number;
  /** Exponentially weighted mean of I^2 (A^2) over ~2 min. */
  meanSq: number;
}

export function initOverload(ts: number, currentA: number): OverloadState {
  return { ts, meanSq: currentA * currentA };
}

export const dischargeLimitC = (tempC: number): number => interpolate(AI_CONFIG.overload.dischargeLimitC, tempC);
export const chargeLimitC = (tempC: number): number => interpolate(AI_CONFIG.overload.chargeLimitC, tempC);

export function stepOverload(
  s: OverloadState,
  ts: number,
  currentA: number,
  tempC: number,
  nom: PackNominal,
): OverloadOutput {
  const cfg = AI_CONFIG.overload;
  const dt = ts - s.ts;
  if (dt > 0) s.meanSq += smoothingWeight(dt, cfg.rmsTauS) * (currentA * currentA - s.meanSq);
  s.ts = ts;

  const charging = currentA < -0.5;
  const rmsA = Math.sqrt(s.meanSq);
  const cRate = Math.abs(currentA) / nom.capacityAh;
  const cRateRms = rmsA / nom.capacityAh;
  const limitC = charging ? chargeLimitC(tempC) : dischargeLimitC(tempC);

  // While charging, compare the present charge current (a charge is a steady CC step); while
  // discharging, compare the RMS over the last two minutes (riding current is bursty).
  const loadC = charging ? cRate : cRateRms;
  const ratio = limitC > 1e-6 ? loadC / limitC : loadC > 0.05 ? 10 : 0;

  const hotCharge = charging && tempC >= cfg.hotChargeC;
  const recommendedDerate = !charging && ratio > 1 ? clamp(1 - cfg.targetRatio / ratio, 0.05, cfg.maxDerate) : 0;
  const recommendedChargeScale = charging && (ratio > 1 || hotCharge) ? clamp(1 / Math.max(ratio, 1) * 0.8, 0.2, 0.8) : 1;

  return { tempC, charging, cRate, cRateRms, limitC, ratio, hotCharge, recommendedDerate, recommendedChargeScale };
}
