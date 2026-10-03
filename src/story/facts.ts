// The numbers the story's captions quote. Every one is taken from a real run of the same
// simulation the screens show (the BMS-vs-Voltify hero run and the ROI model), never typed in.
import { computeRoi, defaultRoiInputs } from '../business/roi';
import type { CabinetAB } from '../eval/cabinet';
import type { ABResult } from '../eval/timeline';
import type { PreventionMeasure } from '../fleet/prevention';
import { scenarioOf } from '../pages/roi/levers';
import { formatClock } from '../lib/timelineSeries';
import { DEFAULT_POLICY } from '../intervention';

export interface AbFacts {
  alertS: number | null;
  tripS: number | null;
  leadS: number | null;
  peakVoltifyC: number;
  peakBmsC: number;
  stationId: string | null;
  distanceM: number | null;
  swapS: number | null;
}

export interface RoiFacts {
  packs: number;
  feeVnd: number;
  carefulNetVnd: number;
  carefulPaybackMonths: number | null;
  breakEvenPct: number | null;
  targetNetVnd: number;
}

export interface StoryNumbers {
  ab: AbFacts | null;
  roi: RoiFacts | null;
}

export function abFacts(ab: ABResult): AbFacts {
  const notified = ab.voltify.events.find((e) => e.kind === 'shipper_notified');
  return {
    alertS: ab.voltify.summary.alertS,
    tripS: ab.bms.summary.bmsTripS,
    leadS: ab.leadTimeS,
    peakVoltifyC: ab.voltify.summary.peakTempC,
    peakBmsC: ab.bms.summary.peakTempC,
    stationId: notified?.stationId ?? null,
    distanceM: notified?.distanceM ?? null,
    swapS: ab.voltify.summary.swapS,
  };
}

export function roiFacts(cabinet: CabinetAB, prevention: PreventionMeasure): RoiFacts {
  const inputs = defaultRoiInputs();
  const measured = {
    chargeTempDropC: cabinet.summaryWithout.meanTempC - cabinet.summaryWith.meanTempC,
    preventionRate: prevention.rate,
  };
  const careful = computeRoi(inputs, scenarioOf('careful', inputs, measured));
  const target = computeRoi(inputs, scenarioOf('target', inputs, measured));
  return {
    packs: inputs.packs,
    feeVnd: inputs.saasFeeVndPerPackMonth,
    carefulNetVnd: careful.netPerYearVnd,
    carefulPaybackMonths: careful.paybackMonths,
    breakEvenPct: careful.breakEvenLifeExtensionPct,
    targetNetVnd: target.netPerYearVnd,
  };
}

/** Everything a caption may quote. */
export const FACT_KEYS = [
  'alert',
  'trip',
  'lead',
  'peak',
  'bmsPeak',
  'derate',
  'station',
  'distance',
  'swap',
  'packs',
  'fee',
  'careful',
  'payback',
  'breakEven',
  'target',
] as const;
export type FactKey = (typeof FACT_KEYS)[number];

export interface FactFormat {
  num: (x: number, dp?: number) => string;
  vnd: (x: number) => string;
}

const GAP = '…';

/** The caption values as text; a figure whose run has not finished yet reads as an ellipsis, never as a guess. */
export function formatFacts(n: StoryNumbers, f: FactFormat): Record<FactKey, string> {
  const ab = n.ab;
  const roi = n.roi;
  const clock = (s: number | null | undefined) => (s === null || s === undefined ? GAP : formatClock(s));
  return {
    alert: clock(ab?.alertS),
    trip: clock(ab?.tripS),
    lead: ab?.leadS === null || ab?.leadS === undefined ? GAP : f.num(ab.leadS / 60, 1),
    peak: ab ? f.num(ab.peakVoltifyC, 1) : GAP,
    bmsPeak: ab ? f.num(ab.peakBmsC, 1) : GAP,
    derate: f.num(DEFAULT_POLICY.derate * 100, 0),
    station: ab?.stationId ?? GAP,
    distance: ab?.distanceM === null || ab?.distanceM === undefined ? GAP : f.num(ab.distanceM, 0),
    swap: clock(ab?.swapS),
    packs: roi ? f.num(roi.packs, 0) : GAP,
    fee: roi ? f.num(roi.feeVnd, 0) : GAP,
    careful: roi ? f.vnd(roi.carefulNetVnd) : GAP,
    payback: roi?.carefulPaybackMonths == null ? GAP : f.num(roi.carefulPaybackMonths, 1),
    breakEven: roi?.breakEvenPct == null ? GAP : f.num(roi.breakEvenPct, 1),
    target: roi ? f.vnd(roi.targetNetVnd) : GAP,
  };
}
