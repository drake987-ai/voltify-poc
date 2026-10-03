// Business and lifetime assumptions behind every money or lifetime figure the app
// shows (CLAUDE.md section 3, rule 5: every business number can be traced to a formula
// and its assumptions). These are ILLUSTRATIVE placeholders for a pilot to replace with
// a customer's real figures; the ROI screen lets the user edit them.

export const ASSUMPTION_IDS = [
  'packCostVnd',
  'packDamageFraction',
  'strandedCostVnd',
  'rideTempC',
  'efcPerDay',
  'chargeShare',
] as const;
export type AssumptionId = (typeof ASSUMPTION_IDS)[number];

export type AssumptionUnit = 'VND' | 'fraction' | 'degC' | 'efcPerDay';

export interface AssumptionDef {
  value: number;
  unit: AssumptionUnit;
}

export const DEFAULT_ASSUMPTIONS: Record<AssumptionId, AssumptionDef> = {
  /** Replacement price of one swappable battery pack. */
  packCostVnd: { value: 12_000_000, unit: 'VND' },
  /** Share of a pack's value lost when it is allowed to overheat toward 65 degC (accelerated ageing, possible write-off). */
  packDamageFraction: { value: 0.25, unit: 'fraction' },
  /** Cost of one vehicle stopped on the road: late deliveries, recovery trip, lost shift time. */
  strandedCostVnd: { value: 300_000, unit: 'VND' },
  /** Average core temperature while riding, for lifetime projections. */
  rideTempC: { value: 42, unit: 'degC' },
  /** Equivalent full cycles a pack does per day. */
  efcPerDay: { value: 1.5, unit: 'efcPerDay' },
  /** Share of each equivalent full cycle spent charging (the rest is discharge). */
  chargeShare: { value: 0.5, unit: 'fraction' },
};

export type AssumptionValues = Record<AssumptionId, number>;

export const defaultValues = (): AssumptionValues =>
  Object.fromEntries(ASSUMPTION_IDS.map((id) => [id, DEFAULT_ASSUMPTIONS[id].value])) as AssumptionValues;

export interface IncidentSavings {
  prevented: number;
  /** VND of pack value kept: prevented x pack cost x damage fraction. */
  packLossAvoidedVnd: number;
  /** VND of stranded-vehicle cost avoided: prevented x cost per stranding. */
  strandedAvoidedVnd: number;
  totalVnd: number;
}

/**
 * Estimated saving from incidents the intervention prevented:
 *   total = prevented x (pack cost x damage fraction + cost per stranded vehicle)
 */
export function incidentSavings(prevented: number, a: AssumptionValues = defaultValues()): IncidentSavings {
  const packLossAvoidedVnd = prevented * a.packCostVnd * a.packDamageFraction;
  const strandedAvoidedVnd = prevented * a.strandedCostVnd;
  return { prevented, packLossAvoidedVnd, strandedAvoidedVnd, totalVnd: packLossAvoidedVnd + strandedAvoidedVnd };
}
