// 1-RC equivalent circuit model of one series cell group:
//   V = OCV(SOC) - I * R0 - V_RC        (I > 0 = discharge)
import { CELL, PHYS } from './params';

/**
 * Multiplier on a cell's nominal R0 for temperature and age.
 * Falls as the cell warms (Arrhenius), rises as SOH drops: 1 + gamma (1 - SOH).
 */
export function r0Factor(coreTempC: number, soh: number): number {
  const tK = coreTempC + PHYS.kelvin;
  const temperature = Math.exp((CELL.r0ActivationJPerMol / PHYS.gasConstant) * (1 / tK - 1 / CELL.r0RefK));
  const age = 1 + CELL.ageResistanceGamma * (1 - soh);
  return temperature * age;
}

/** Exact discrete update of the RC branch voltage over `dtS` at constant current. */
export function stepRc(vRc: number, r1Ohm: number, currentA: number, dtS: number): number {
  const a = Math.exp(-dtS / CELL.tauRcS);
  return vRc * a + r1Ohm * currentA * (1 - a);
}

/** Terminal voltage of a cell group. `currentThroughR0` includes any internal-short current. */
export function terminalVoltage(ocvV: number, currentThroughR0A: number, r0Ohm: number, vRc: number): number {
  return ocvV - currentThroughR0A * r0Ohm - vRc;
}
