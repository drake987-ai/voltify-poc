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

export interface MixedLifetimeInput {
  /** Capacity fade per equivalent full cycle while charging (already averaged over the charge), as from `fadePerEfc`. */
  chargeFadePerEfc: number;
  /** Average core temperature while riding, degC. */
  rideTempC: number;
  /** Share of an equivalent full cycle spent charging (the rest is discharge). */
  chargeShare?: number;
  efcPerDay: number;
  eolSoh?: number;
}

export interface MixedLifetime {
  fadePerEfc: number;
  efcToEol: number;
  daysToEol: number;
}

/**
 * Lifetime of a pack that spends part of each cycle charging at one temperature and the rest
 * riding at another: the fade per cycle is the share-weighted average of the two rates.
 */
export function projectMixedLifetime(input: MixedLifetimeInput): MixedLifetime {
  const { chargeFadePerEfc, rideTempC, efcPerDay, chargeShare = 0.5, eolSoh = AGING.eolSoh } = input;
  const fade = chargeShare * chargeFadePerEfc + (1 - chargeShare) * fadePerEfc(rideTempC);
  const efcToEol = Math.max(0, 1 - eolSoh) / fade;
  return { fadePerEfc: fade, efcToEol, daysToEol: efcPerDay > 0 ? efcToEol / efcPerDay : Number.POSITIVE_INFINITY };
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
