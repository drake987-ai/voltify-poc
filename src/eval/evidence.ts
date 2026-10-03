// The Evidence screen's batch evaluation (CLAUDE.md sections 5 and 6, screen 8): many simulated
// packs, with and without a fault, run through the real pipeline (simulator -> vendor payload ->
// adapter -> AI) and judged against what the simulator knows. Nothing here is typed in by hand:
// every figure on the screen is computed from these runs.
//
// All seeds are different from the ones the AI's thresholds were tuned on (201-203), so these
// runs are held out. They are still simulations: they say how the AI behaves on this simulator,
// not how it will behave on real packs.
import type { Brand } from '../adapters';
import { classifySoh, type SohClass } from '../ai';
import type { ScenarioSelection } from '../sim';
import { runCase, type BatteryOutcome } from './runCase';
import { NEAR_MISS_C, SHORT_FAULTS, type ShortSeverity, type SuiteKind, type SuiteSpec } from './suites';

export * from './suites';

/** What the simulator says happened to a pack. */
export type Truth = 'event' | 'near_miss' | 'normal';

export interface EvidenceSample {
  suiteId: string;
  kind: SuiteKind;
  label: string;
  /** Table row this sample belongs to (a scenario, or the short targets and their neighbours). */
  group: string;
  seed: number;
  /** Fleet size of the run, so the pack can be replayed. */
  n: number;
  batteryId: string;
  brand: Brand;
  truth: Truth;
  /** Why it is an event: an internal short, a BMS cut-off at 65 degC, or both. */
  cause: 'short' | 'trip' | 'short+trip' | null;
  /** Highest Risk Score the AI gave it during the run. */
  maxScore: number;
  /** First time the AI reached the Warning level, s; null = never. */
  alertS: number | null;
  dangerS: number | null;
  bmsTripS: number | null;
  faultOnsetS: number | null;
  maxTempC: number;
  /** The run that produced it, as a replayable timeline spec (scenario, injection). */
  replay: {
    scenario: ScenarioSelection;
    inject?: { atS: number; fault: (typeof SHORT_FAULTS)[ShortSeverity] };
    durationS: number;
  };
}

export interface SohSample {
  brand: Brand;
  est: number;
  truth: number;
  classEst: SohClass;
  classTrue: SohClass;
}

export interface SuiteResult {
  spec: SuiteSpec;
  samples: EvidenceSample[];
  soh: SohSample[];
  rejectedFrames: number;
}

export function truthOfOutcome(o: BatteryOutcome): { truth: Truth; cause: EvidenceSample['cause'] } {
  const short = o.hasFault;
  const trip = o.bmsTripS !== null;
  if (short || trip) return { truth: 'event', cause: short && trip ? 'short+trip' : short ? 'short' : 'trip' };
  return { truth: o.maxCoreTempC >= NEAR_MISS_C ? 'near_miss' : 'normal', cause: null };
}

export function runSuite(spec: SuiteSpec): SuiteResult {
  const r = runCase({
    fleet: { seed: spec.seed, n: spec.n, scenario: spec.scenario },
    ...(spec.short
      ? { target: { brand: spec.short.brand }, inject: { atS: spec.short.atS, fault: SHORT_FAULTS[spec.short.severity] } }
      : {}),
    durationS: spec.durationS,
  });
  const targetId = r.target.batteryId;
  const all = [r.target, ...r.others];

  const samples: EvidenceSample[] = all.map((o) => {
    const { truth, cause } = truthOfOutcome(o);
    const isTarget = spec.short !== undefined && o.batteryId === targetId;
    return {
      suiteId: spec.id,
      kind: spec.kind,
      label: spec.label,
      group: spec.short ? (isTarget ? `short.${spec.short.severity}` : 'shortNeighbour') : spec.label,
      seed: spec.seed,
      n: spec.n,
      batteryId: o.batteryId,
      brand: o.brand,
      truth,
      cause,
      maxScore: o.maxScore,
      alertS: o.firstAlertS,
      dangerS: o.firstDangerS,
      bmsTripS: o.bmsTripS,
      faultOnsetS: o.faultOnsetS,
      maxTempC: o.maxCoreTempC,
      replay: {
        scenario: spec.scenario,
        ...(isTarget && spec.short ? { inject: { atS: spec.short.atS, fault: SHORT_FAULTS[spec.short.severity] } } : {}),
        durationS: spec.durationS,
      },
    };
  });

  // Health estimation is judged on the fleets without a fault (their SOH covers the whole range, plus the aged scenario).
  const soh: SohSample[] =
    spec.kind === 'healthy'
      ? all
          .filter((o) => o.sohEstFinal !== null && o.sohClassFinal !== null)
          .map((o) => ({
            brand: o.brand,
            est: o.sohEstFinal as number,
            truth: o.sohTrueFinal,
            classEst: o.sohClassFinal as SohClass,
            classTrue: classifySoh(o.sohTrueFinal),
          }))
      : [];

  return { spec, samples, soh, rejectedFrames: r.rejectedFrames };
}

// ---------------------------------------------------------------------------------------------
// Aggregation: from the samples to precision, recall, false-alarm rate, lead time, ROC and SOH error.

/** How the cases the ground truth cannot call clearly are counted. All choices are shown on screen. */
export interface EvidenceOptions {
  /** Packs that got within 5 degC of the BMS limit without tripping: leave them out, or count them as events or as normal. */
  nearMiss: 'exclude' | 'event' | 'normal';
  /** The weak-cell fleet (a maintenance finding, not a fire): count its alerts as false alarms, or leave the fleet out. */
  maintenance: 'normal' | 'exclude';
}

export const DEFAULT_OPTIONS: EvidenceOptions = { nearMiss: 'exclude', maintenance: 'normal' };

export interface Rate {
  num: number;
  den: number;
  value: number | null;
  /** 95 % Wilson interval. */
  lo: number | null;
  hi: number | null;
}

export function rate(num: number, den: number): Rate {
  if (den <= 0) return { num, den, value: null, lo: null, hi: null };
  const z = 1.96;
  const p = num / den;
  const denom = 1 + (z * z) / den;
  const centre = (p + (z * z) / (2 * den)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / den + (z * z) / (4 * den * den))) / denom;
  return { num, den, value: p, lo: Math.max(0, centre - half), hi: Math.min(1, centre + half) };
}

export interface Confusion {
  tp: number;
  fp: number;
  fn: number;
  tn: number;
}

export interface Spread {
  n: number;
  mean: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
  /** Every value, seconds, sorted. */
  values: number[];
}

export function spread(values: number[]): Spread {
  const v = [...values].sort((a, b) => a - b);
  const n = v.length;
  if (n === 0) return { n, mean: null, median: null, min: null, max: null, values: v };
  return {
    n,
    mean: v.reduce((s, x) => s + x, 0) / n,
    median: n % 2 === 1 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2,
    min: v[0],
    max: v[n - 1],
    values: v,
  };
}

export interface RocPoint {
  threshold: number;
  tpr: number;
  fpr: number;
}

export interface GroupRow {
  group: string;
  packs: number;
  events: number;
  nearMisses: number;
  /** Packs that reached the Warning level. */
  alerted: number;
  /** Events that reached it. */
  eventsAlerted: number;
  /** Median seconds from an injected short starting to the AI's alert (null if the group has none). */
  medianDelayS: number | null;
}

export interface SohBrandRow {
  brand: Brand;
  n: number;
  /** Mean absolute error of the SOH estimate, percentage points. */
  maePp: number;
  /** Mean signed error (estimate minus truth), percentage points. */
  biasPp: number;
  /** Share of packs put in the right good / fair / weak class. */
  classAccuracy: number;
}

export interface EvidenceSummary {
  options: EvidenceOptions;
  packs: number;
  events: number;
  normals: number;
  /** Near misses left out (or counted, depending on the option). */
  nearMisses: number;
  /** Packs left out of the confusion matrix by the options. */
  excluded: number;
  confusion: Confusion;
  precision: Rate;
  recall: Rate;
  falseAlarmRate: Rate;
  /** Share of the counted packs that are events (precision depends on it). */
  prevalence: Rate;
  /** Events that tripped the BMS and were alerted: seconds from the alert to the cut-off (negative = alert came after). */
  leadTime: Spread;
  /** Events the AI alerted on only after the BMS had tripped. */
  lateAlerts: number;
  /** Injected shorts: seconds from the short starting to the AI's alert. */
  detectionDelay: Spread;
  roc: RocPoint[];
  auc: number | null;
  groups: GroupRow[];
  misses: EvidenceSample[];
  falseAlarms: EvidenceSample[];
  soh: { rows: SohBrandRow[]; points: SohSample[] };
  rejectedFrames: number;
}

const ALERT_SCORE = 50;

export function aggregate(results: readonly SuiteResult[], options: EvidenceOptions = DEFAULT_OPTIONS): EvidenceSummary {
  const all = results.flatMap((r) => r.samples);

  const counted = all.filter((s) => !(options.maintenance === 'exclude' && s.kind === 'maintenance'));
  const label = (s: EvidenceSample): 'event' | 'normal' | null => {
    if (s.truth === 'event') return 'event';
    if (s.truth === 'normal') return 'normal';
    return options.nearMiss === 'exclude' ? null : options.nearMiss;
  };

  const confusion: Confusion = { tp: 0, fp: 0, fn: 0, tn: 0 };
  const misses: EvidenceSample[] = [];
  const falseAlarms: EvidenceSample[] = [];
  const scored: { score: number; event: boolean }[] = [];
  let excluded = all.length - counted.length;
  for (const s of counted) {
    const l = label(s);
    if (l === null) {
      excluded++;
      continue;
    }
    const alerted = s.alertS !== null;
    if (l === 'event') {
      if (alerted) confusion.tp++;
      else {
        confusion.fn++;
        misses.push(s);
      }
    } else if (alerted) {
      confusion.fp++;
      falseAlarms.push(s);
    } else confusion.tn++;
    scored.push({ score: s.maxScore, event: l === 'event' });
  }

  const events = confusion.tp + confusion.fn;
  const normals = confusion.fp + confusion.tn;

  // Lead time and detection delay are measured on the events, whatever the near-miss option says.
  const leadValues: number[] = [];
  let late = 0;
  for (const s of counted) {
    if (s.truth !== 'event' || s.alertS === null || s.bmsTripS === null) continue;
    const lead = s.bmsTripS - s.alertS;
    if (lead < 0) late++;
    else leadValues.push(lead);
  }
  const delays = counted
    .filter((s) => s.truth === 'event' && s.faultOnsetS !== null && s.alertS !== null)
    .map((s) => (s.alertS as number) - (s.faultOnsetS as number));

  // ROC over the Risk Score threshold.
  const roc: RocPoint[] = [];
  for (let thr = 0; thr <= 100; thr += 1) {
    let tp = 0;
    let fp = 0;
    for (const x of scored) {
      if (x.score >= thr) {
        if (x.event) tp++;
        else fp++;
      }
    }
    roc.push({ threshold: thr, tpr: events > 0 ? tp / events : 0, fpr: normals > 0 ? fp / normals : 0 });
  }
  roc.push({ threshold: 101, tpr: 0, fpr: 0 });
  let auc: number | null = null;
  if (events > 0 && normals > 0) {
    // roc runs from high FPR (threshold 0) to low FPR; integrate with the trapezoid rule.
    auc = 0;
    for (let i = 0; i + 1 < roc.length; i++) auc += ((roc[i].fpr - roc[i + 1].fpr) * (roc[i].tpr + roc[i + 1].tpr)) / 2;
  }

  // Per-group table (over everything, before the options).
  const groups = new Map<string, GroupRow>();
  for (const s of all) {
    const g = groups.get(s.group) ?? { group: s.group, packs: 0, events: 0, nearMisses: 0, alerted: 0, eventsAlerted: 0, medianDelayS: null };
    g.packs++;
    if (s.truth === 'event') g.events++;
    if (s.truth === 'near_miss') g.nearMisses++;
    if (s.alertS !== null) g.alerted++;
    if (s.truth === 'event' && s.alertS !== null) g.eventsAlerted++;
    groups.set(s.group, g);
  }

  for (const g of groups.values()) {
    const d = all
      .filter((s) => s.group === g.group && s.truth === 'event' && s.faultOnsetS !== null && s.alertS !== null)
      .map((s) => (s.alertS as number) - (s.faultOnsetS as number));
    g.medianDelayS = spread(d).median;
  }

  // SOH.
  const sohPoints = results.flatMap((r) => r.soh);
  const rows: SohBrandRow[] = (['A', 'B', 'C'] as const).flatMap((brand) => {
    const xs = sohPoints.filter((p) => p.brand === brand);
    if (xs.length === 0) return [];
    const errs = xs.map((p) => (p.est - p.truth) * 100);
    return [
      {
        brand,
        n: xs.length,
        maePp: errs.reduce((s, e) => s + Math.abs(e), 0) / xs.length,
        biasPp: errs.reduce((s, e) => s + e, 0) / xs.length,
        classAccuracy: xs.filter((p) => p.classEst === p.classTrue).length / xs.length,
      },
    ];
  });

  return {
    options,
    packs: counted.length,
    events,
    normals,
    nearMisses: counted.filter((s) => s.truth === 'near_miss').length,
    excluded,
    confusion,
    precision: rate(confusion.tp, confusion.tp + confusion.fp),
    recall: rate(confusion.tp, events),
    falseAlarmRate: rate(confusion.fp, normals),
    prevalence: rate(events, events + normals),
    leadTime: spread(leadValues),
    lateAlerts: late,
    detectionDelay: spread(delays),
    roc,
    auc,
    groups: [...groups.values()],
    misses,
    falseAlarms,
    soh: { rows, points: sohPoints },
    rejectedFrames: results.reduce((s, r) => s + r.rejectedFrames, 0),
  };
}

/** The Warning level of the Risk Score: the operating point of the confusion matrix. */
export const OPERATING_THRESHOLD = ALERT_SCORE;
