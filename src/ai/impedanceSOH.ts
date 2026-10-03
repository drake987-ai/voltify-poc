// Module 4: internal resistance and state of health.
//
// The step change of terminal voltage when the current steps is -R * dI, so a
// recursive least-squares fit of dV on dI recovers R. Three corrections make it
// usable on real traffic:
//   * temperature: R falls as the cell warms, so the fit is for R at 25 degC
//   * polarisation: the 1-RC branch voltage also moves between samples. It is
//     tracked explicitly from the measured current (a state observer using the
//     current resistance estimate) and its change is added back to dV, which stays
//     correct whatever the vendor's cadence (5, 10 or 15 s) and however fast the
//     current changes
//   * open-circuit drift: a second regressor absorbs the slow fall of OCV with the
//     charge drawn between the two samples
// SOH follows from the nominal ageing law R = R_new * (1 + gamma * (1 - SOH)).
import { AI_CONFIG } from './config';
import { clamp } from './mathutil';
import { AGE_GAMMA, resistanceTempFactor, type PackNominal } from './nominal';
import type { ImpedanceOutput, SohClass } from './types';

export interface ImpedanceState {
  /** Fit parameters: resistance as a multiple of the new-pack R at 25 degC, and OCV-drift scale. */
  theta1: number;
  theta2: number;
  /** Covariance of the fit (symmetric 2x2). */
  p11: number;
  p12: number;
  p22: number;
  /** Observed polarisation (RC branch) voltage of the whole pack, V. */
  v1: number;
  prevTs: number | null;
  prevI: number;
  prevV: number;
  updates: number;
}

export function initImpedance(): ImpedanceState {
  const cfg = AI_CONFIG.impedance;
  return {
    theta1: 1 + AGE_GAMMA * (1 - cfg.priorSoh),
    theta2: 1,
    p11: (cfg.priorSigma * AGE_GAMMA) ** 2,
    p12: 0,
    p22: 0.25,
    v1: 0,
    prevTs: null,
    prevI: 0,
    prevV: 0,
    updates: 0,
  };
}

/**
 * SOH from the resistance relative to a new pack (`theta1`): R grows as 1 + gamma (1 - SOH), so
 * SOH = 1 - (R / R_new - 1) / gamma. `gamma` is the chemistry's ageing constant; the module uses the
 * simulator's, and the Evidence screen tests that assumption on real cells.
 */
export const sohFromTheta = (theta1: number, gamma: number = AGE_GAMMA): number => clamp(1 - (theta1 - 1) / gamma, 0.5, 1);

export function stepImpedance(
  s: ImpedanceState,
  ts: number,
  packVoltageV: number,
  currentA: number,
  tempC: number,
  nom: PackNominal,
): void {
  const cfg = AI_CONFIG.impedance;
  const fT = resistanceTempFactor(tempC);
  // Pack R1 from the current estimate of R0 (the branch scales with it, as in the cell model).
  const r1Pack = nom.r1Ratio * s.theta1 * nom.r0PackOhm25 * fT;
  if (s.prevTs === null) {
    s.v1 = r1Pack * currentA;
  } else {
    const dt = ts - s.prevTs;
    const dI = currentA - s.prevI;
    const v1Prev = s.v1;
    if (dt > 0) {
      const decay = Math.exp(-dt / nom.tauRcS);
      s.v1 = decay * v1Prev + r1Pack * (1 - decay) * currentA;
    }
    if (dt > 0 && dt <= cfg.maxDtS && Math.abs(dI) >= cfg.minDeltaA) {
      const phi1 = -dI * nom.r0PackOhm25 * fT;
      const phi2 = (-currentA * dt * nom.ocvSlopePackVPerSoc) / (3600 * nom.capacityAh);
      // Voltage change with the polarisation change added back leaves only R0 * dI and OCV drift.
      const y = packVoltageV - s.prevV + (s.v1 - v1Prev);

      const pPhi1 = s.p11 * phi1 + s.p12 * phi2;
      const pPhi2 = s.p12 * phi1 + s.p22 * phi2;
      const denom = cfg.forgetting + phi1 * pPhi1 + phi2 * pPhi2;
      const k1 = pPhi1 / denom;
      const k2 = pPhi2 / denom;
      const err = y - (s.theta1 * phi1 + s.theta2 * phi2);

      s.theta1 = clamp(s.theta1 + k1 * err, 0.6, 4);
      s.theta2 = clamp(s.theta2 + k2 * err, 0.3, 3);
      s.p11 = (s.p11 - k1 * pPhi1) / cfg.forgetting;
      s.p12 = (s.p12 - k1 * pPhi2) / cfg.forgetting;
      s.p22 = (s.p22 - k2 * pPhi2) / cfg.forgetting;
      s.updates += 1;
    }
  }
  s.prevTs = ts;
  s.prevI = currentA;
  s.prevV = packVoltageV;
}

export function classifySoh(soh: number): SohClass {
  const cfg = AI_CONFIG.impedance;
  return soh >= cfg.goodSoh ? 'good' : soh >= cfg.fairSoh ? 'fair' : 'weak';
}

/** Pack resistance (ohm) at the given temperature, from the current fit. */
export const packResistanceOhm = (s: ImpedanceState, tempC: number, nom: PackNominal): number =>
  s.theta1 * nom.r0PackOhm25 * resistanceTempFactor(tempC);

export function impedanceOutput(s: ImpedanceState, nom: PackNominal): ImpedanceOutput {
  const soh = sohFromTheta(s.theta1);
  return {
    r25mOhm: s.theta1 * nom.r0PackOhm25 * 1000,
    sohEst: soh,
    confidence: clamp(s.updates / AI_CONFIG.impedance.fullConfidenceUpdates, 0, 1),
    updates: s.updates,
    class: classifySoh(soh),
  };
}
