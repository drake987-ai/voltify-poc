// Arrhenius capacity fade. See AGING in params.ts for the assumptions.
import { AGING, PHYS } from './params';

/** Rate multiplier at `tempC` relative to `refC`: exp(-Ea/R * (1/T - 1/Tref)). */
export function arrheniusFactor(tempC: number, refC: number = AGING.refTempC, eaJPerMol: number = AGING.eaJPerMol): number {
  const t = tempC + PHYS.kelvin;
  const ref = refC + PHYS.kelvin;
  return Math.exp(-(eaJPerMol / PHYS.gasConstant) * (1 / t - 1 / ref));
}

/** SOH fraction lost per equivalent full cycle at core temperature `tempC`. */
export function fadePerEfc(tempC: number, eaJPerMol: number = AGING.eaJPerMol): number {
  return AGING.kRefPerEfc * arrheniusFactor(tempC, AGING.refTempC, eaJPerMol);
}

export interface LifetimeInput {
  /** Average core temperature while cycling, degC. */
  coreTempC: number;
  /** Equivalent full cycles per day. */
  efcPerDay: number;
  startSoh?: number;
  eolSoh?: number;
  eaJPerMol?: number;
}

export interface LifetimeProjection {
  fadePerEfc: number;
  efcToEol: number;
  daysToEol: number;
}

/** Cycles and days until SOH falls from `startSoh` to `eolSoh` at a constant temperature. */
export function projectLifetime(input: LifetimeInput): LifetimeProjection {
  const { coreTempC, efcPerDay, startSoh = 1, eolSoh = AGING.eolSoh, eaJPerMol = AGING.eaJPerMol } = input;
  const fade = fadePerEfc(coreTempC, eaJPerMol);
  const efcToEol = Math.max(0, startSoh - eolSoh) / fade;
  return { fadePerEfc: fade, efcToEol, daysToEol: efcPerDay > 0 ? efcToEol / efcPerDay : Number.POSITIVE_INFINITY };
}
