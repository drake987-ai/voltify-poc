import type { LineSeriesOption, ScatterSeriesOption } from 'echarts/charts';
import type { TFunction } from 'i18next';
import type { ChartColors } from '@/components/charts/useChartColors';
import type { EChartsOption } from '@/components/charts/echarts';
import { chargeFrames } from '@/eval/cabinet';
import type { Timeline } from '@/eval/timeline';
import type { CabinetEvent } from '@/intervention';
import { currentLang, formatNumber } from '@/lib/format';
import { pairs } from '@/lib/timelineSeries';

/** Labels on the chart keep at least this long between them. */
const MIN_LABEL_GAP_S = 20 * 60;

export type CabinetMetric = 'temperature' | 'current';

/** The charge window of a run as column arrays (computed once per timeline). */
export interface ChargeSeries {
  tS: number[];
  tMin: number[];
  tempC: number[];
  /** Charging current magnitude, A. */
  currentA: number[];
  /** Charging-current multiplier the cabinet applied (1 = full). */
  scale: number[];
  soc: number[];
}

const cache = new WeakMap<Timeline, ChargeSeries>();

export function chargeSeriesOf(timeline: Timeline): ChargeSeries {
  const hit = cache.get(timeline);
  if (hit) return hit;
  const frames = chargeFrames(timeline);
  const out: ChargeSeries = {
    tS: frames.map((f) => f.tS),
    tMin: frames.map((f) => f.tS / 60),
    tempC: frames.map((f) => f.telemetry.coreTemp),
    currentA: frames.map((f) => Math.abs(f.telemetry.current)),
    scale: frames.map((f) => f.truth.chargeScale),
    soc: frames.map((f) => f.telemetry.soc),
  };
  cache.set(timeline, out);
  return out;
}

/** Number of entries of an ascending list of times that are at or before `tS` (binary search). */
export function countTimesUpTo(times: readonly number[], tS: number): number {
  let lo = 0;
  let hi = times.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= tS) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** The charge in this series as it stands at time `tS` (the last frame once the charge is over). */
export function chargeStateAt(series: ChargeSeries, tS: number) {
  const n = series.tS.length;
  if (n === 0) return null;
  const i = Math.max(0, Math.min(n - 1, countTimesUpTo(series.tS, tS) - 1));
  return {
    tempC: series.tempC[i],
    currentA: series.currentA[i],
    scale: series.scale[i],
    soc: series.soc[i],
    over: tS > series.tS[n - 1],
  };
}

interface Args {
  without: Timeline;
  withCut: Timeline;
  metric: CabinetMetric;
  tS: number;
  windowS: number;
  colors: ChartColors;
  t: TFunction;
  /** Cabinet commands to mark (already limited to the window). */
  events: readonly CabinetEvent[];
}

export function buildCabinetOption({ without, withCut, metric, tS, windowS, colors, t, events }: Args): EChartsOption {
  const a = chargeSeriesOf(without);
  const b = chargeSeriesOf(withCut);
  const values = (s: ChargeSeries) => (metric === 'temperature' ? s.tempC : s.currentA);
  const countA = countTimesUpTo(a.tS, tS);
  const countB = countTimesUpTo(b.tS, tS);

  const unit = metric === 'temperature' ? '°C' : 'A';
  const nameWithout = t('intervention.cabinet.worlds.without');
  const nameWith = t('intervention.cabinet.worlds.with');

  const lastOf = (data: [number, number][]) => data[data.length - 1];
  const dataA = pairs(a.tMin, values(a), countA);
  const dataB = pairs(b.tMin, values(b), countB);

  // Commands a few minutes apart would print on top of each other: each is marked, but only the
  // first of a close group carries a label.
  let lastLabelS = -Infinity;
  const markLines = events
    .filter((e) => e.tS <= tS)
    .map((e) => {
      const labelled = e.tS - lastLabelS >= MIN_LABEL_GAP_S;
      if (labelled) lastLabelS = e.tS;
      return {
        xAxis: e.tS / 60,
        lineStyle: { color: colors.accent, width: 1.2, type: 'dotted' as const },
        label: {
          show: labelled,
          formatter: t(`intervention.cabinet.marks.${e.kind}`),
          position: 'insideEndTop' as const,
          rotate: 90,
          color: colors.accent,
          fontSize: 11,
        },
      };
    });

  const series: (LineSeriesOption | ScatterSeriesOption)[] = [
    {
      name: nameWithout,
      type: 'line',
      showSymbol: false,
      data: dataA,
      lineStyle: { width: 2.5, color: colors.danger },
      itemStyle: { color: colors.danger },
    },
    {
      name: nameWith,
      type: 'line',
      showSymbol: false,
      data: dataB,
      lineStyle: { width: 2.5, color: colors.accent },
      itemStyle: { color: colors.accent },
      markLine: { silent: true, symbol: 'none', animation: false, data: markLines },
    },
  ];
  for (const [data, color] of [
    [lastOf(dataA), colors.danger],
    [lastOf(dataB), colors.accent],
  ] as const) {
    series.push({
      name: 'now',
      type: 'scatter',
      data: data ? [data] : [],
      symbolSize: 9,
      itemStyle: { color, borderColor: colors.surface, borderWidth: 2 },
      tooltip: { show: false },
      silent: true,
    });
  }

  return {
    animation: false,
    grid: { left: 52, right: 14, top: 28, bottom: 70 },
    legend: {
      bottom: 0,
      itemWidth: 18,
      textStyle: { color: colors.muted, fontSize: 12 },
      data: [nameWithout, nameWith],
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: colors.surface,
      borderColor: colors.border,
      textStyle: { color: colors.text, fontSize: 12 },
      valueFormatter: (v: unknown) => (typeof v === 'number' ? `${formatNumber(v, currentLang(), 1)} ${unit}` : String(v)),
      axisPointer: { type: 'line', lineStyle: { color: colors.muted } },
    },
    xAxis: {
      type: 'value',
      min: 0,
      max: windowS / 60,
      name: t('intervention.cabinet.axisTime'),
      nameLocation: 'middle',
      nameGap: 28,
      nameTextStyle: { color: colors.muted },
      axisLabel: { color: colors.muted },
      axisLine: { lineStyle: { color: colors.border } },
      splitLine: { lineStyle: { color: colors.border, opacity: 0.5 } },
    },
    yAxis: {
      type: 'value',
      scale: true,
      name: t(metric === 'temperature' ? 'intervention.cabinet.axisTemp' : 'intervention.cabinet.axisCurrent'),
      nameTextStyle: { color: colors.muted, align: 'left' },
      axisLabel: { color: colors.muted },
      splitLine: { lineStyle: { color: colors.border, opacity: 0.5 } },
    },
    series,
  };
}
