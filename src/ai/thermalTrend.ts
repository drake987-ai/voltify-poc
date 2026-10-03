// Module 1: thermal trend.
//
// A Kalman filter on two states, the core temperature T and an unexplained heat
// power q (W), over the standard lumped thermal model
//     C dT/dt = I^2 R - hA (T - T_amb) + q
// driven by the measured current and ambient temperature. The model says how fast
// the pack SHOULD be warming given load and weather; q is whatever extra heat the
// measurements demand, so q / C is the residual dT/dt against the standard model
// (CLAUDE.md section 5). Because the filter steps by the real time between samples,
// vendors reporting every 5, 10 or 15 s need no special handling, and the noisier
// 0.5 degC channel of brand C is handled by a larger measurement variance.
//
// Lead time: the filtered state is projected forward until it reaches the limit
// (65 degC), both by straight-line extrapolation of the present heating rate and
// by running the model forward with the unexplained heat growing at the rate it
// has recently been growing (never assumed to fade). Faults that are developing
// accelerate, so holding the heat constant would promise more time than there is;
// the growth-aware forecast is deliberately the conservative one. The earlier of
// the two is the live time-to-limit.
import { AI_CONFIG } from './config';
import { clamp, smoothingWeight } from './mathutil';
import { LIMIT_TEMP_C, type PackNominal } from './nominal';
import type { ThermalOutput } from './types';

/** Exponentially weighted straight-line fit of a signal against time; sums are relative to "now". */
export interface RateFit {
  s0: number;
  s1: number;
  s2: number;
  sy: number;
  sxy: number;
}

export const emptyFit = (): RateFit => ({ s0: 0, s1: 0, s2: 0, sy: 0, sxy: 0 });

export function updateRateFit(f: RateFit, dt: number, tau: number, y: number): void {
  const d = Math.exp(-dt / tau);
  // Decay the old points and move the time origin forward by dt (x' = x - dt).
  const s0 = f.s0 * d;
  const s1 = (f.s1 - dt * f.s0) * d;
  const s2 = (f.s2 - 2 * dt * f.s1 + dt * dt * f.s0) * d;
  const sy = f.sy * d;
  const sxy = (f.sxy - dt * f.sy) * d;
  f.s0 = s0 + 1;
  f.s1 = s1;
  f.s2 = s2;
  f.sy = sy + y;
  f.sxy = sxy;
}

/** Slope of the fit per second; 0 until there is enough spread in time to define it. */
export function rateOf(f: RateFit): number {
  const det = f.s0 * f.s2 - f.s1 * f.s1;
  return f.s0 > 3 && det > 1e-6 ? (f.s0 * f.sxy - f.s1 * f.sy) / det : 0;
}

/**
 * Seconds until the core temperature reaches `limitC`, stepping the thermal model
 *     tau dT/dt = -(T - Tamb) + (Qj + q(t)) / hA
 * forward with the unexplained heat growing exponentially at the relative rate
 * `growthPerS` it has recently shown, q(t) = min(q0 * exp(growthPerS * t), capW).
 * Internal shorts accelerate, so a bounded exponential is the cautious assumption;
 * the cap keeps it within the heat a single cell group can physically release.
 * Returns null if the limit is not reached within the horizon.
 */
export function timeToLimitS(
  tempC: number,
  ambientC: number,
  jouleW: number,
  heatW: number,
  growthPerS: number,
  nom: PackNominal,
  limitC: number,
  horizonS = 7200,
): number | null {
  if (tempC >= limitC) return 0;
  const hA = nom.thermalConductanceWPerK;
  const tau = nom.thermalCapacityJPerK / hA;
  // Quick exit: no growth and the steady state sits below the limit.
  if (growthPerS <= 0 && ambientC + (jouleW + heatW) / hA <= limitC + 0.05) return null;

  const step = 20;
  const e = Math.exp(-step / tau);
  const capW = AI_CONFIG.thermal.heatCapW;
  const q0 = Math.max(heatW, 0);
  let temp = tempC;
  for (let t = 0; t < horizonS; t += step) {
    const q = growthPerS > 0 ? Math.min(q0 * Math.exp(growthPerS * (t + step / 2)), Math.max(capW, q0)) : heatW;
    const next = e * temp + (1 - e) * (ambientC + (jouleW + q) / hA);
    if (next >= limitC) return t + (step * (limitC - temp)) / (next - temp);
    temp = next;
  }
  return null;
}

export interface ThermalState {
  ts: number;
  /** Filtered core temperature and unexplained heat. */
  temp: number;
  heat: number;
  /** Covariance of (temp, heat). */
  pTT: number;
  pTq: number;
  pqq: number;
  /** Smoothed ambient temperature and previous current (for trapezoid Joule heat). */
  ambient: number;
  prevI: number;
  /** Smoothed Joule-heat power, W. */
  jouleAvgW: number;
  /** Temperature of a healthy pack of this type (open-loop nominal model). */
  nominalTemp: number;
  /** Timestamp since which the heat has stayed above the warning level; null if not. */
  aboveSince: number | null;
  /** Consecutive rejected measurements (outlier gate). */
  rejected: number;
  /** Fit of the unexplained heat against time, whose slope is how fast the heat is growing. */
  heatFit: RateFit;
  /** Smoothed normalised innovation squared: ~1 when the filter keeps up, large when it lags. */
  nisAvg: number;
  samples: number;
}

export function initThermal(
  ts: number,
  tempC: number,
  ambientC: number,
  currentA: number,
  sigmaTempC: number,
): ThermalState {
  return {
    ts,
    temp: tempC,
    heat: 0,
    pTT: sigmaTempC * sigmaTempC,
    pTq: 0,
    pqq: AI_CONFIG.thermal.heatPriorSigmaW ** 2,
    ambient: ambientC,
    prevI: currentA,
    jouleAvgW: 0,
    nominalTemp: tempC,
    aboveSince: null,
    rejected: 0,
    heatFit: emptyFit(),
    nisAvg: 1,
    samples: 1,
  };
}

/** Advance the filter with one sample. `packResistanceOhm` is the pack resistance at the present temperature. */
export function stepThermal(
  s: ThermalState,
  ts: number,
  tempC: number,
  ambientC: number,
  currentA: number,
  packResistanceOhm: number,
  nom: PackNominal,
  sigmaTempC: number,
): void {
  const cfg = AI_CONFIG.thermal;
  const dt = ts - s.ts;
  if (!(dt > 0)) return;

  s.ambient += smoothingWeight(dt, cfg.ambientTauS) * (ambientC - s.ambient);
  const hA = nom.thermalConductanceWPerK;
  const tau = nom.thermalCapacityJPerK / hA;

  // Joule heat over the interval, trapezoid on I^2 (current changes within a 5-15 s interval).
  const jouleW = 0.5 * (s.prevI * s.prevI + currentA * currentA) * packResistanceOhm;
  s.jouleAvgW += smoothingWeight(dt, cfg.joulePowerTauS) * (jouleW - s.jouleAvgW);

  // Predict: exact solution of the thermal ODE over dt with the heat held constant.
  const e = Math.exp(-dt / tau);
  const k = (1 - e) / hA;
  const drive = (1 - e) * (s.ambient + jouleW / hA);
  const tempPred = e * s.temp + k * s.heat + drive;

  // Adaptive process noise: when the recent innovations are persistently larger than the
  // filter expects, the hidden heat is changing faster than assumed, so let it move faster.
  const noiseBoost = clamp(s.nisAvg / cfg.nisTarget, 1, cfg.maxNoiseBoost);
  const pTT = e * e * s.pTT + 2 * e * k * s.pTq + k * k * s.pqq + cfg.procTempSigma ** 2 * dt;
  const pTq = e * s.pTq + k * s.pqq;
  const pqq = s.pqq + cfg.procHeatSigma ** 2 * dt * noiseBoost;

  s.nominalTemp = e * s.nominalTemp + (1 - e) * (s.ambient + jouleW / hA);

  // Update with the measurement, rejecting gross outliers (a stuck or glitching sensor).
  const r = sigmaTempC * sigmaTempC;
  const innovation = tempC - tempPred;
  const innovVar = pTT + r;
  const accepted = Math.abs(innovation) <= 6 * Math.sqrt(innovVar) || s.rejected >= 5;
  if (accepted) {
    s.nisAvg += smoothingWeight(dt, cfg.nisTauS) * ((innovation * innovation) / innovVar - s.nisAvg);
  }
  if (accepted) {
    const k0 = pTT / innovVar;
    const k1 = pTq / innovVar;
    s.temp = tempPred + k0 * innovation;
    s.heat = clamp(s.heat + k1 * innovation, cfg.heatMinW, cfg.heatMaxW);
    s.pTT = (1 - k0) * pTT;
    s.pTq = (1 - k0) * pTq;
    s.pqq = pqq - k1 * pTq;
    s.rejected = 0;
  } else {
    s.temp = tempPred;
    s.pTT = pTT;
    s.pTq = pTq;
    s.pqq = pqq;
    s.rejected += 1;
  }

  updateRateFit(s.heatFit, dt, cfg.heatRateTauS, s.heat);

  // Keep the healthy-pack twin anchored to reality only while nothing is wrong.
  if (s.aboveSince === null) s.nominalTemp += smoothingWeight(dt, cfg.twinAnchorTauS) * (s.temp - s.nominalTemp);

  if (s.heat >= cfg.warnW) s.aboveSince ??= ts;
  else if (s.heat < cfg.warnW - cfg.hysteresisW) s.aboveSince = null;

  s.prevI = currentA;
  s.ts = ts;
  s.samples += 1;
}

export function thermalOutput(s: ThermalState, nom: PackNominal): ThermalOutput {
  const hA = nom.thermalConductanceWPerK;
  const C = nom.thermalCapacityJPerK;

  const expectedKPerS = (s.jouleAvgW - hA * (s.temp - s.ambient)) / C;
  const measuredKPerS = expectedKPerS + s.heat / C;

  // The heat is only ever assumed to keep growing, never to fade, and only once it is
  // clearly present: above the warning level for a while. Otherwise the slope of a noisy,
  // still-converging near-zero signal would drive the forecast.
  const heatPresent = s.aboveSince !== null && s.ts - s.aboveSince >= AI_CONFIG.thermal.growthMinPersistS;
  const heatRateWPerS = heatPresent ? Math.max(rateOf(s.heatFit), 0) : 0;
  const growthPerS = Math.min(heatRateWPerS / Math.max(s.heat, AI_CONFIG.thermal.warnW), AI_CONFIG.thermal.maxGrowthPerS);

  let etaLinearS: number | null = null;
  let etaModelS: number | null = null;
  if (s.temp >= LIMIT_TEMP_C) {
    etaLinearS = 0;
    etaModelS = 0;
  } else {
    if (measuredKPerS > 1e-6) etaLinearS = (LIMIT_TEMP_C - s.temp) / measuredKPerS;
    etaModelS = timeToLimitS(s.temp, s.ambient, s.jouleAvgW, s.heat, growthPerS, nom, LIMIT_TEMP_C);
  }
  const etaToLimitS =
    etaLinearS === null ? etaModelS : etaModelS === null ? etaLinearS : Math.min(etaLinearS, etaModelS);

  return {
    tempC: s.temp,
    unexplainedHeatW: s.heat,
    unexplainedHeatSigmaW: Math.sqrt(Math.max(s.pqq, 0)),
    heatRateWPerMin: heatRateWPerS * 60,
    expectedDTdtKPerMin: expectedKPerS * 60,
    measuredDTdtKPerMin: measuredKPerS * 60,
    residualDTdtKPerMin: (s.heat / C) * 60,
    etaLinearS,
    etaModelS,
    etaToLimitS,
    nominalTempC: s.nominalTemp,
    persistenceS: s.aboveSince === null ? 0 : s.ts - s.aboveSince,
  };
}
