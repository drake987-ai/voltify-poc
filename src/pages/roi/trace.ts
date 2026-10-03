// "Show me how this figure is built": for each output of the ROI screen, the named steps from
// the inputs to the figure, with the numbers of one case substituted in. The screen shows the
// formula text next to these rows, so every figure can be followed by hand.
import type { RoiResult } from '../../business/roi';

export const TRACE_IDS = ['replacement', 'life', 'energy', 'incidents', 'net', 'payback'] as const;
export type TraceId = (typeof TRACE_IDS)[number];

/** Number and money formatting is the screen's job (language, units); the steps just ask for it. */
export interface TraceFormat {
  /** A plain number with `dp` decimals. */
  num: (x: number, dp?: number) => string;
  /** An amount in VND, in a readable size. */
  vnd: (x: number) => string;
  /** A percentage given as a number of percent. */
  pct: (x: number, dp?: number) => string;
}

/** Every step the traces use; each is a key of `roi.trace.steps.*`. */
export type TraceStep =
  | 'fadePerCycle' | 'cyclesToEol' | 'daysToEol' | 'replacementsBefore' | 'lifeExtension' | 'daysWith'
  | 'replacementsAfter' | 'packCost' | 'replacementSaving' | 'temperature' | 'cyclesPerDay' | 'daysAdded'
  | 'energyKwh' | 'price' | 'energyBill' | 'energySavingPct' | 'energySaving' | 'incidentsBefore'
  | 'preventionRate' | 'incidentsPrevented' | 'costPerIncident' | 'incidentSaving' | 'totalBenefit'
  | 'saasFee' | 'netBenefit' | 'benefitPerFee' | 'breakEven' | 'onboarding' | 'netPerMonth' | 'paybackMonths';

export interface TraceRow {
  step: TraceStep;
  value: string;
}

export function traceRows(id: TraceId, r: RoiResult, f: TraceFormat): TraceRow[] {
  const i = r.inputs;
  const b = r.baseline;
  const w = r.withVoltify;
  switch (id) {
    case 'replacement':
      return [
        { step: 'fadePerCycle', value: f.pct(b.fadePerEfc * 100, 4) },
        { step: 'cyclesToEol', value: f.num(b.efcToEol, 0) },
        { step: 'daysToEol', value: f.num(b.daysToEol, 0) },
        { step: 'replacementsBefore', value: f.num(b.replacementsPerYear, 0) },
        { step: 'lifeExtension', value: f.pct(r.scenario.lifeExtensionPct, 1) },
        { step: 'daysWith', value: f.num(w.daysToEol, 0) },
        { step: 'replacementsAfter', value: f.num(w.replacementsPerYear, 0) },
        { step: 'packCost', value: f.vnd(i.packCostVnd) },
        { step: 'replacementSaving', value: f.vnd(r.savings.replacementVnd) },
      ];
    case 'life':
      return [
        { step: 'temperature', value: `${f.num(i.rideTempC, 0)} °C` },
        { step: 'fadePerCycle', value: f.pct(b.fadePerEfc * 100, 4) },
        { step: 'cyclesToEol', value: f.num(b.efcToEol, 0) },
        { step: 'cyclesPerDay', value: f.num(i.efcPerDay, 1) },
        { step: 'daysToEol', value: f.num(b.daysToEol, 0) },
        { step: 'lifeExtension', value: f.pct(r.scenario.lifeExtensionPct, 1) },
        { step: 'daysWith', value: f.num(w.daysToEol, 0) },
        { step: 'daysAdded', value: f.num(r.lifeAddedDays, 0) },
      ];
    case 'energy':
      return [
        { step: 'energyKwh', value: f.num(b.energyKwhPerYear, 0) },
        { step: 'price', value: f.vnd(i.electricityVndPerKwh) },
        { step: 'energyBill', value: f.vnd(b.energyCostVnd) },
        { step: 'energySavingPct', value: f.pct(r.scenario.electricitySavingPct, 1) },
        { step: 'energySaving', value: f.vnd(r.savings.energyVnd) },
      ];
    case 'incidents':
      return [
        { step: 'incidentsBefore', value: f.num(b.incidentsPerYear, 1) },
        { step: 'preventionRate', value: f.pct(r.scenario.preventionRate * 100, 1) },
        { step: 'incidentsPrevented', value: f.num(r.incidentsPrevented, 1) },
        { step: 'costPerIncident', value: f.vnd(i.packCostVnd * i.packDamageFraction + i.strandedCostVnd) },
        { step: 'incidentSaving', value: f.vnd(r.savings.incidentsVnd) },
      ];
    case 'net':
      return [
        { step: 'replacementSaving', value: f.vnd(r.savings.replacementVnd) },
        { step: 'energySaving', value: f.vnd(r.savings.energyVnd) },
        { step: 'incidentSaving', value: f.vnd(r.savings.incidentsVnd) },
        { step: 'totalBenefit', value: f.vnd(r.savings.totalVnd) },
        { step: 'saasFee', value: f.vnd(r.saasCostPerYearVnd) },
        { step: 'netBenefit', value: f.vnd(r.netPerYearVnd) },
        { step: 'benefitPerFee', value: r.benefitPerFeeVnd === null ? '—' : `×${f.num(r.benefitPerFeeVnd, 1)}` },
        { step: 'breakEven', value: r.breakEvenLifeExtensionPct === null ? '—' : f.pct(r.breakEvenLifeExtensionPct, 1) },
      ];
    case 'payback':
      return [
        { step: 'onboarding', value: f.vnd(r.onboardingVnd) },
        { step: 'netPerMonth', value: f.vnd(r.netPerYearVnd / 12) },
        { step: 'paybackMonths', value: r.paybackMonths === null ? '—' : f.num(r.paybackMonths, 1) },
      ];
  }
}
