// The levers that separate the careful case from the target case, and where each default comes
// from. A careful value is only ever something the simulation measured (or zero if the PoC did not
// measure it); a target value is the figure the brief aims for and says a pilot must confirm.
import { lifeExtensionFromChargeCooling, type RoiInputs, type RoiScenario } from '../../business/roi';

export const CASES = ['careful', 'target'] as const;
export type CaseId = (typeof CASES)[number];

export const LEVERS = ['lifeExtensionPct', 'electricitySavingPct', 'preventionPct'] as const;
export type LeverId = (typeof LEVERS)[number];

/** Where a lever's value comes from. */
export type LeverSource =
  /** Computed from a simulation run. */
  | 'measured'
  /** A target stated in the brief; a pilot has to confirm it. */
  | 'target'
  /** The PoC did not measure it, so the careful case counts none of it. */
  | 'unmeasured'
  /** The measurement is still running. */
  | 'pending'
  /** Typed in by the user. */
  | 'override';

export interface Measured {
  /** Mean core temperature drop while charging when the platform cuts the charge current (degC). */
  chargeTempDropC: number | null;
  /** Share of the control fleet's BMS cut-offs that Voltify prevented, 0..1. */
  preventionRate: number | null;
}

export interface LeverValue {
  /** Percent. */
  value: number;
  source: LeverSource;
}

/** The target of the brief: about 35 % longer pack life and about 20 % off the station electricity bill. */
export const TARGET_LIFE_EXTENSION_PCT = 35;
export const TARGET_ELECTRICITY_SAVING_PCT = 20;

export type Overrides = Partial<Record<`${CaseId}.${LeverId}`, number>>;

const preventionDefault = (m: Measured): LeverValue =>
  m.preventionRate === null ? { value: 0, source: 'unmeasured' } : { value: m.preventionRate * 100, source: 'measured' };

export function leverValue(c: CaseId, lever: LeverId, inputs: RoiInputs, measured: Measured, overrides: Overrides = {}): LeverValue {
  const typed = overrides[`${c}.${lever}`];
  if (typed !== undefined) return { value: typed, source: 'override' };

  switch (lever) {
    case 'lifeExtensionPct':
      if (c === 'target') return { value: TARGET_LIFE_EXTENSION_PCT, source: 'target' };
      return measured.chargeTempDropC === null
        ? { value: 0, source: 'pending' }
        : {
            value: lifeExtensionFromChargeCooling({ tempC: inputs.rideTempC, chargeShare: inputs.chargeShare }, measured.chargeTempDropC),
            source: 'measured',
          };
    case 'electricitySavingPct':
      return c === 'target' ? { value: TARGET_ELECTRICITY_SAVING_PCT, source: 'target' } : { value: 0, source: 'unmeasured' };
    case 'preventionPct':
      return preventionDefault(measured);
  }
}

export function scenarioOf(c: CaseId, inputs: RoiInputs, measured: Measured, overrides: Overrides = {}): RoiScenario {
  const v = (l: LeverId) => leverValue(c, l, inputs, measured, overrides).value;
  return {
    lifeExtensionPct: v('lifeExtensionPct'),
    electricitySavingPct: v('electricitySavingPct'),
    preventionRate: Math.min(1, Math.max(0, v('preventionPct') / 100)),
  };
}
