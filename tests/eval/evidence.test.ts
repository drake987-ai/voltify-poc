import { beforeAll, describe, expect, it } from 'vitest';
import {
  DEFAULT_OPTIONS,
  EVIDENCE_SEEDS,
  NEAR_MISS_C,
  SHORT_SEVERITIES,
  aggregate,
  evidenceSuites,
  rate,
  runSuite,
  spread,
  type EvidenceSample,
  type SuiteResult,
  type SuiteSpec,
} from '@/eval/evidence';

// A sample with sensible defaults, for testing the arithmetic on hand-made numbers.
const sample = (over: Partial<EvidenceSample> & Pick<EvidenceSample, 'truth'>): EvidenceSample => ({
  suiteId: 's',
  kind: 'healthy',
  label: 'x',
  group: 'x',
  seed: 1,
  n: 1,
  batteryId: 'A-0001',
  brand: 'A',
  cause: over.truth === 'event' ? 'trip' : null,
  maxScore: 0,
  alertS: null,
  dangerS: null,
  bmsTripS: null,
  faultOnsetS: null,
  maxTempC: 40,
  replay: { scenario: 'baseline', durationS: 100 },
  ...over,
});

const suite = (samples: EvidenceSample[]): SuiteResult => ({
  spec: { id: 's', kind: 'healthy', label: 'x', scenario: 'baseline', seed: 1, n: 1, durationS: 100 },
  samples,
  soh: [],
  rejectedFrames: 0,
});

describe('rates', () => {
  it('give the ratio and a 95 % Wilson interval that contains it', () => {
    const r = rate(75, 100);
    expect(r.value).toBe(0.75);
    expect(r.lo!).toBeLessThan(0.75);
    expect(r.hi!).toBeGreaterThan(0.75);
    // Textbook value for 75/100: about 0.657 to 0.825.
    expect(r.lo!).toBeCloseTo(0.657, 2);
    expect(r.hi!).toBeCloseTo(0.825, 2);
  });

  it('never claim certainty from a finite sample: 75 of 75 still has a lower bound well below 1', () => {
    const r = rate(75, 75);
    expect(r.value).toBe(1);
    expect(r.hi!).toBeLessThanOrEqual(1);
    expect(r.lo!).toBeLessThan(0.97);
  });

  it('are absent, not zero, with nothing to divide by', () => {
    expect(rate(0, 0)).toEqual({ num: 0, den: 0, value: null, lo: null, hi: null });
  });

  it('get narrower with more data', () => {
    const small = rate(9, 10);
    const big = rate(900, 1000);
    expect(big.hi! - big.lo!).toBeLessThan(small.hi! - small.lo!);
  });
});

describe('spread', () => {
  it('sorts and summarises', () => {
    const s = spread([30, 10, 20, 40]);
    expect(s).toMatchObject({ n: 4, mean: 25, median: 25, min: 10, max: 40, values: [10, 20, 30, 40] });
    expect(spread([5]).median).toBe(5);
    expect(spread([])).toMatchObject({ n: 0, mean: null, median: null });
  });
});

describe('aggregation on hand-made samples', () => {
  const samples = [
    // 3 events: two alerted (one with a lead time of 10 min, one late), one missed.
    sample({ truth: 'event', alertS: 100, bmsTripS: 700, maxScore: 90 }),
    sample({ truth: 'event', alertS: 900, bmsTripS: 800, maxScore: 80 }),
    sample({ truth: 'event', maxScore: 20 }),
    // 5 normals: one false alarm.
    sample({ truth: 'normal', alertS: 50, maxScore: 60 }),
    ...Array.from({ length: 4 }, () => sample({ truth: 'normal', maxScore: 10 })),
    // 2 near misses.
    sample({ truth: 'near_miss', alertS: 10, maxScore: 70, maxTempC: NEAR_MISS_C + 1 }),
    sample({ truth: 'near_miss', maxScore: 15, maxTempC: NEAR_MISS_C + 2 }),
  ];
  const results = [suite(samples)];

  it('counts the confusion matrix with near misses left out by default', () => {
    const a = aggregate(results);
    expect(a.options).toEqual(DEFAULT_OPTIONS);
    expect(a.confusion).toEqual({ tp: 2, fn: 1, fp: 1, tn: 4 });
    expect(a.excluded).toBe(2);
    expect(a.precision).toMatchObject({ num: 2, den: 3 });
    expect(a.recall).toMatchObject({ num: 2, den: 3 });
    expect(a.falseAlarmRate).toMatchObject({ num: 1, den: 5 });
    expect(a.prevalence).toMatchObject({ num: 3, den: 8 });
  });

  it('moves the numbers, visibly, when the near misses are counted as events or as normal', () => {
    const asEvent = aggregate(results, { ...DEFAULT_OPTIONS, nearMiss: 'event' });
    expect(asEvent.confusion).toEqual({ tp: 3, fn: 2, fp: 1, tn: 4 });
    const asNormal = aggregate(results, { ...DEFAULT_OPTIONS, nearMiss: 'normal' });
    expect(asNormal.confusion).toEqual({ tp: 2, fn: 1, fp: 2, tn: 5 });
    expect(asNormal.excluded).toBe(0);
  });

  it('lists every miss and every false alarm', () => {
    const a = aggregate(results);
    expect(a.misses).toHaveLength(1);
    expect(a.misses[0].maxScore).toBe(20);
    expect(a.falseAlarms).toHaveLength(1);
    expect(a.falseAlarms[0].maxScore).toBe(60);
  });

  it('measures the lead time only on events with an alert and a cut-off, and counts late alerts apart', () => {
    const a = aggregate(results);
    expect(a.leadTime.values).toEqual([600]);
    expect(a.lateAlerts).toBe(1);
  });

  it('draws an ROC that starts at (1,1), ends at (0,0) and has an area between 0.5 and 1 for a useful score', () => {
    const a = aggregate(results);
    expect(a.roc[0]).toMatchObject({ threshold: 0, tpr: 1, fpr: 1 });
    expect(a.roc[a.roc.length - 1]).toMatchObject({ tpr: 0, fpr: 0 });
    for (let i = 1; i < a.roc.length; i++) {
      expect(a.roc[i].tpr).toBeLessThanOrEqual(a.roc[i - 1].tpr);
      expect(a.roc[i].fpr).toBeLessThanOrEqual(a.roc[i - 1].fpr);
    }
    expect(a.auc!).toBeGreaterThan(0.5);
    expect(a.auc!).toBeLessThanOrEqual(1);
  });

  it('gives an AUC of 1 for a perfect score and about 0.5 for a score that carries no information', () => {
    const perfect = aggregate([suite([sample({ truth: 'event', maxScore: 90 }), sample({ truth: 'normal', maxScore: 10 })])]);
    expect(perfect.auc).toBeCloseTo(1, 9);
    const useless = aggregate([suite([sample({ truth: 'event', maxScore: 50 }), sample({ truth: 'normal', maxScore: 50 })])]);
    expect(useless.auc).toBeCloseTo(0.5, 9);
  });

  it('can leave the maintenance fleet out', () => {
    const withMaintenance = suite([
      sample({ truth: 'event', alertS: 1, maxScore: 90 }),
      sample({ truth: 'normal', kind: 'maintenance', alertS: 1, maxScore: 80 }),
      sample({ truth: 'normal', maxScore: 5 }),
    ]);
    expect(aggregate([withMaintenance]).confusion.fp).toBe(1);
    const left = aggregate([withMaintenance], { ...DEFAULT_OPTIONS, maintenance: 'exclude' });
    expect(left.confusion).toEqual({ tp: 1, fn: 0, fp: 0, tn: 1 });
    expect(left.excluded).toBe(1);
  });

  it('is absent, not made up, when there is nothing of one class', () => {
    const onlyNormals = aggregate([suite([sample({ truth: 'normal', maxScore: 1 })])]);
    expect(onlyNormals.recall.value).toBeNull();
    expect(onlyNormals.auc).toBeNull();
  });
});

describe('the suites', () => {
  const suites = evidenceSuites();
  const spec = (pattern: RegExp) => suites.find((s) => pattern.test(s.id)) as SuiteSpec;

  it('use only seeds the AI was not tuned on (it was tuned on 201-203)', () => {
    for (const s of suites) expect(s.seed, s.id).toBeGreaterThan(300);
    for (const seed of EVIDENCE_SEEDS) expect(seed).toBeGreaterThan(300);
  });

  it('have unique ids and cover healthy, weak-cell, overload and every short severity', () => {
    expect(new Set(suites.map((s) => s.id)).size).toBe(suites.length);
    for (const kind of ['healthy', 'maintenance', 'overload', 'short'] as const) expect(suites.some((s) => s.kind === kind), kind).toBe(true);
    for (const sev of SHORT_SEVERITIES) expect(suites.some((s) => s.short?.severity === sev), sev).toBe(true);
  });

  it('start every injected short after the engine has had time to learn the pack', () => {
    for (const s of suites) if (s.short) expect(s.short.atS).toBeGreaterThanOrEqual(1200);
  });

  it('run a small suite end to end with the labels the simulator gives', () => {
    const healthy = runSuite({ ...spec(/^healthy\.baseline\./), n: 6, durationS: 1800 });
    expect(healthy.samples).toHaveLength(6);
    for (const s of healthy.samples) expect(s.truth).toBe('normal');
    expect(healthy.rejectedFrames).toBe(0);

    const short = runSuite(spec(/^short\.severe\.A\./));
    const target = short.samples.find((s) => s.group === 'short.severe')!;
    expect(target.truth).toBe('event');
    expect(target.cause).toBe('short');
    expect(target.faultOnsetS).toBeGreaterThanOrEqual(1200);
    expect(target.alertS).not.toBeNull();
    // The neighbours are ordinary packs.
    for (const s of short.samples.filter((x) => x.group === 'shortNeighbour')) expect(s.truth).toBe('normal');
    // The replay description is enough to rebuild the run.
    expect(target.replay.inject?.atS).toBe(target.faultOnsetS);
  });
});

describe('the whole evaluation (every suite, on the simulator, in the browser-sized batch)', () => {
  let results: SuiteResult[];
  beforeAll(() => {
    results = evidenceSuites().map(runSuite);
  }, 120_000);

  it('is deterministic', () => {
    const again = evidenceSuites()
      .slice(0, 3)
      .map(runSuite);
    expect(JSON.stringify(again)).toBe(JSON.stringify(results.slice(0, 3)));
  });

  it('is a decent-sized sample with several events of each kind and no rejected frames', () => {
    const a = aggregate(results);
    expect(a.packs).toBeGreaterThan(1000);
    expect(a.events).toBeGreaterThan(80);
    expect(a.normals).toBeGreaterThan(1000);
    expect(a.rejectedFrames).toBe(0);
    for (const g of a.groups.filter((x) => x.group.startsWith('short.'))) expect(g.events, g.group).toBeGreaterThanOrEqual(12);
  });

  it('keeps ordinary hot-weather fleets quiet: at most a stray false alarm per hundred packs', () => {
    const a = aggregate(results);
    for (const group of ['baseline', 'heatwave43', 'heavyClimb', 'agedHigh', 'shortNeighbour']) {
      const g = a.groups.find((x) => x.group === group)!;
      expect(g.alerted / g.packs, group).toBeLessThan(0.01);
    }
  });

  it('flags many of the weak-cell packs, a known limit (a faded cell and a leaking one look alike to the voltage module)', () => {
    const a = aggregate(results);
    const g = a.groups.find((x) => x.group === 'cellImbalance')!;
    expect(g.alerted / g.packs).toBeGreaterThan(0.2);
    // The matrix counts them as false alarms unless the fleet is left out.
    expect(aggregate(results).falseAlarms.length).toBeGreaterThan(aggregate(results, { ...DEFAULT_OPTIONS, maintenance: 'exclude' }).falseAlarms.length);
  });

  it('catches the shorts that matter and misses only the ones at the edge of visibility', () => {
    const a = aggregate(results);
    for (const group of ['short.severe', 'short.moderate', 'short.mild']) {
      const g = a.groups.find((x) => x.group === group)!;
      expect(g.eventsAlerted, group).toBe(g.events);
    }
    expect(a.misses.length).toBeGreaterThan(0);
    for (const m of a.misses) expect(m.group).toBe('short.veryMild');
    // The slower the short, the later it is seen.
    const delay = (g: string) => a.groups.find((x) => x.group === g)!.medianDelayS!;
    expect(delay('short.severe')).toBeLessThan(delay('short.moderate'));
    expect(delay('short.moderate')).toBeLessThan(delay('short.mild'));
  });

  it('measures a lead time of tens of minutes before the BMS cut-off, below the 30-45 minute target', () => {
    const a = aggregate(results);
    expect(a.leadTime.n).toBeGreaterThan(40);
    expect(a.lateAlerts).toBe(0);
    expect(a.leadTime.min!).toBeGreaterThan(5 * 60);
    expect(a.leadTime.mean!).toBeGreaterThan(15 * 60);
    // The target is NOT met on this simulator; the screen reports what is measured.
    expect(a.leadTime.max!).toBeLessThan(30 * 60);
  });

  it('ranks events above normals (ROC area close to 1, but the sample cannot prove perfection)', () => {
    const a = aggregate(results);
    expect(a.auc!).toBeGreaterThan(0.95);
    expect(a.recall.hi!).toBeLessThanOrEqual(1);
    expect(a.precision.value!).toBeLessThan(1);
  });

  it('estimates SOH within a few points, worse for the brand that reports least often', () => {
    const a = aggregate(results);
    const mae = (b: string) => a.soh.rows.find((r) => r.brand === b)!.maePp;
    expect(mae('A')).toBeLessThan(1);
    expect(mae('B')).toBeLessThan(2.5);
    expect(mae('C')).toBeLessThan(4);
    expect(mae('A')).toBeLessThan(mae('C'));
    for (const r of a.soh.rows) expect(r.classAccuracy).toBeGreaterThan(0.7);
  });
});
