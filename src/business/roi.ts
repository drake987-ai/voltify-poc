// ROI and impact model (CLAUDE.md section 6, screen 7). Pure functions: the same inputs always
// give the same figures, every figure is built from named steps the screen can show, and every
// input is an editable assumption. The defaults are ILLUSTRATIVE placeholders so the model can
// run; a pilot replaces them with the customer's real numbers.
import { fadePerEfc, projectLifetime } from '../sim/aging';
import { defaultValues, incidentSavings } from './assumptions';

/** The five inputs the brief asks for come first; the rest are assumptions behind the figures. */
export const ROI_INPUT_IDS = [
  'packs',
  'packCostVnd',
  'rideTempC',
  'efcPerDay',
  'saasFeeVndPerPackMonth',
  'chargeShare',
  'packKwh',
  'electricityVndPerKwh',
  'chargeEfficiency',
  'incidentsPerThousandPacksYear',
  'packDamageFraction',
  'strandedCostVnd',
  'onboardingVndPerPack',
] as const;
export type RoiInputId = (typeof ROI_INPUT_IDS)[number];
export const ROI_PRIMARY_IDS: readonly RoiInputId[] = ROI_INPUT_IDS.slice(0, 5);

export type RoiUnit = 'count' | 'VND' | 'degC' | 'efcPerDay' | 'fraction' | 'kWh' | 'VND/kWh' | 'perThousand';

export interface RoiFieldMeta {
  unit: RoiUnit;
  min: number;
  max: number;
  step: number;
}

export const ROI_FIELDS: Record<RoiInputId, RoiFieldMeta> = {
  packs: { unit: 'count', min: 1, max: 1_000_000, step: 100 },
  packCostVnd: { unit: 'VND', min: 100_000, max: 200_000_000, step: 500_000 },
  rideTempC: { unit: 'degC', min: 20, max: 60, step: 1 },
  efcPerDay: { unit: 'efcPerDay', min: 0.1, max: 6, step: 0.1 },
  saasFeeVndPerPackMonth: { unit: 'VND', min: 0, max: 1_000_000, step: 1_000 },
  chargeShare: { unit: 'fraction', min: 0, max: 1, step: 0.05 },
  packKwh: { unit: 'kWh', min: 0.2, max: 10, step: 0.1 },
  electricityVndPerKwh: { unit: 'VND/kWh', min: 0, max: 20_000, step: 100 },
  chargeEfficiency: { unit: 'fraction', min: 0.5, max: 1, step: 0.01 },
  incidentsPerThousandPacksYear: { unit: 'perThousand', min: 0, max: 1_000, step: 1 },
  packDamageFraction: { unit: 'fraction', min: 0, max: 1, step: 0.05 },
  strandedCostVnd: { unit: 'VND', min: 0, max: 50_000_000, step: 10_000 },
  onboardingVndPerPack: { unit: 'VND', min: 0, max: 5_000_000, step: 10_000 },
};

export type RoiInputs = Record<RoiInputId, number>;

/**
 * Illustrative defaults. The cost, damage, temperature, cycle and charge-share values are the same
 * ones the Fleet screen's KPIs use (one source of truth); the others are placeholders to be replaced.
 */
export function defaultRoiInputs(): RoiInputs {
  const shared = defaultValues();
  return {
    packs: 5_000,
    packCostVnd: shared.packCostVnd,
    rideTempC: shared.rideTempC,
    efcPerDay: shared.efcPerDay,
    saasFeeVndPerPackMonth: 25_000,
    chargeShare: shared.chargeShare,
    // A 16S5P pack of 21700 cells is about 1.4 kWh (the simulated pack).
    packKwh: 1.4,
    electricityVndPerKwh: 2_500,
    chargeEfficiency: 0.9,
    incidentsPerThousandPacksYear: 10,
    packDamageFraction: shared.packDamageFraction,
    strandedCostVnd: shared.strandedCostVnd,
    onboardingVndPerPack: 100_000,
  };
}

/** Keep a typed value inside the field's range; anything that is not a finite number is rejected (null). */
export function sanitizeInput(id: RoiInputId, value: number): number | null {
  if (!Number.isFinite(value)) return null;
  const { min, max } = ROI_FIELDS[id];
  return Math.min(max, Math.max(min, value));
}

/** The levers that differ between the careful case and the target case. */
export interface RoiScenario {
  /** Longer pack life, percent (+35 means a pack lasts 1.35 times as long). */
  lifeExtensionPct: number;
  /** Share of the station electricity bill saved, percent. */
  electricitySavingPct: number;
  /** Share of baseline BMS-cut-off incidents that are prevented, 0..1. */
  preventionRate: number;
}

/**
 * Life extension that follows from running the pack cooler while it charges: the fade per cycle is
 * the share-weighted mean of the charging and the riding fade, and only the charging part gets
 * cooler by `chargeTempDropC`. Arrhenius ageing (src/sim/aging.ts) turns the temperature into a rate.
 */
export function lifeExtensionFromChargeCooling(
  input: { tempC: number; chargeShare: number },
  chargeTempDropC: number,
): number {
  const base = fadePerEfc(input.tempC);
  const cooled = input.chargeShare * fadePerEfc(input.tempC - chargeTempDropC) + (1 - input.chargeShare) * base;
  return (base / cooled - 1) * 100;
}

export interface RoiResult {
  inputs: RoiInputs;
  scenario: RoiScenario;
  baseline: {
    fadePerEfc: number;
    efcToEol: number;
    daysToEol: number;
    yearsToEol: number;
    replacementsPerYear: number;
    replacementCostVnd: number;
    energyKwhPerYear: number;
    energyCostVnd: number;
    incidentsPerYear: number;
  };
  withVoltify: {
    daysToEol: number;
    yearsToEol: number;
    replacementsPerYear: number;
    replacementCostVnd: number;
    energyCostVnd: number;
    incidentsPerYear: number;
  };
  /** Per year, VND. */
  savings: {
    replacementVnd: number;
    energyVnd: number;
    incidentsVnd: number;
    incidentPackLossVnd: number;
    incidentStrandedVnd: number;
    totalVnd: number;
  };
  saasCostPerYearVnd: number;
  onboardingVnd: number;
  /** Total benefit minus the SaaS fee, per year. */
  netPerYearVnd: number;
  incidentsPrevented: number;
  lifeAddedDays: number;
  /** Months to earn back the one-off onboarding cost from the net benefit; null if the net benefit is not positive. */
  paybackMonths: number | null;
  /** Benefit per VND of SaaS fee; null if there is no fee. */
  benefitPerFeeVnd: number | null;
  /** Smallest life extension (percent) at which benefits cover the fee, other levers held; null if no extension could. */
  breakEvenLifeExtensionPct: number | null;
}

const DAYS_PER_YEAR = 365;

export function computeRoi(inputs: RoiInputs, scenario: RoiScenario): RoiResult {
  const i = inputs;
  const base = projectLifetime({ coreTempC: i.rideTempC, efcPerDay: i.efcPerDay });

  const extension = Math.max(-99, scenario.lifeExtensionPct) / 100;
  const daysWith = base.daysToEol * (1 + extension);
  // A pack that never wears out (no cycles) is never replaced, so nothing can be saved on replacements.
  const perYear = (days: number) => (Number.isFinite(days) && days > 0 ? (i.packs * DAYS_PER_YEAR) / days : 0);
  const replBase = perYear(base.daysToEol);
  const replWith = perYear(daysWith);

  const energyKwh = (i.packs * i.efcPerDay * DAYS_PER_YEAR * i.packKwh) / i.chargeEfficiency;
  const energyCost = energyKwh * i.electricityVndPerKwh;
  const energyWith = energyCost * (1 - scenario.electricitySavingPct / 100);

  const incidentsBase = (i.packs * i.incidentsPerThousandPacksYear) / 1000;
  const prevention = Math.min(1, Math.max(0, scenario.preventionRate));
  const prevented = incidentsBase * prevention;
  const inc = incidentSavings(prevented, {
    packCostVnd: i.packCostVnd,
    packDamageFraction: i.packDamageFraction,
    strandedCostVnd: i.strandedCostVnd,
    rideTempC: i.rideTempC,
    efcPerDay: i.efcPerDay,
    chargeShare: i.chargeShare,
  });

  const replacementSaving = (replBase - replWith) * i.packCostVnd;
  const energySaving = energyCost - energyWith;
  const totalSaving = replacementSaving + energySaving + inc.totalVnd;
  const saas = i.packs * i.saasFeeVndPerPackMonth * 12;
  const net = totalSaving - saas;
  const onboarding = i.packs * i.onboardingVndPerPack;

  // Break-even life extension: replacement saving = P*N*365/d0 * (1 - 1/(1+e)); solve for e.
  const replCostBase = replBase * i.packCostVnd;
  const need = saas - energySaving - inc.totalVnd;
  let breakEven: number | null;
  if (need <= 0) breakEven = 0;
  else if (replCostBase <= 0 || need >= replCostBase) breakEven = null;
  else breakEven = (1 / (1 - need / replCostBase) - 1) * 100;

  return {
    inputs,
    scenario,
    baseline: {
      fadePerEfc: base.fadePerEfc,
      efcToEol: base.efcToEol,
      daysToEol: base.daysToEol,
      yearsToEol: base.daysToEol / DAYS_PER_YEAR,
      replacementsPerYear: replBase,
      replacementCostVnd: replBase * i.packCostVnd,
      energyKwhPerYear: energyKwh,
      energyCostVnd: energyCost,
      incidentsPerYear: incidentsBase,
    },
    withVoltify: {
      daysToEol: daysWith,
      yearsToEol: daysWith / DAYS_PER_YEAR,
      replacementsPerYear: replWith,
      replacementCostVnd: replWith * i.packCostVnd,
      energyCostVnd: energyWith,
      incidentsPerYear: incidentsBase - prevented,
    },
    savings: {
      replacementVnd: replacementSaving,
      energyVnd: energySaving,
      incidentsVnd: inc.totalVnd,
      incidentPackLossVnd: inc.packLossAvoidedVnd,
      incidentStrandedVnd: inc.strandedAvoidedVnd,
      totalVnd: totalSaving,
    },
    saasCostPerYearVnd: saas,
    onboardingVnd: onboarding,
    netPerYearVnd: net,
    incidentsPrevented: prevented,
    lifeAddedDays: Number.isFinite(base.daysToEol) ? daysWith - base.daysToEol : 0,
    paybackMonths: net > 0 ? (onboarding > 0 ? onboarding / (net / 12) : 0) : null,
    benefitPerFeeVnd: saas > 0 ? totalSaving / saas : null,
    breakEvenLifeExtensionPct: breakEven,
  };
}
