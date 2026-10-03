import type { LineSeriesOption, ScatterSeriesOption } from 'echarts/charts';
import type { MarkAreaComponentOption } from 'echarts/components';
import type { TFunction } from 'i18next';
import type { ChartColors } from '@/components/charts/useChartColors';
import type { EChartsOption } from '@/components/charts/echarts';
import type { Timeline, TimelineEventKind } from '@/eval/timeline';
import { LIMIT_TEMP_C } from '@/ai';
import { currentLang, formatNumber } from '@/lib/format';
import { countUpTo, pairs, seriesOf } from '@/lib/timelineSeries';

export type AbSide = 'bms' | 'voltify';

/** Which events are marked on each side's chart. */
const MARKED: Record<AbSide, TimelineEventKind[]> = {
  bms: ['bms_trip'],
  voltify: ['ai_alert', 'derate_sent', 'swap_done', 'bms_trip'],
};

export const Y_MIN = 30;
export const Y_MAX = 70;

interface Args {
  timeline: Timeline;
  side: AbSide;
  tS: number;
  durationS: number;
  colors: ChartColors;
  t: TFunction;
}

export function buildAbOption({ timeline, side, tS, durationS, colors, t }: Args): EChartsOption {
  const s = seriesOf(timeline);
  const count = countUpTo(timeline.frames, tS);
  const nowMin = tS / 60;
  const eventColor: Record<TimelineEventKind, string> = {
    ai_alert: colors.warning,
    derate_sent: colors.accent,
    shipper_notified: colors.accent,
    swap_done: colors.accent,
    bms_trip: colors.danger,
    vehicle_stopped: colors.danger,
  };

  // The alert and the power cut it triggers are seconds apart: one marker with one label.
  const alertEvent = timeline.events.find((e) => e.kind === 'ai_alert');
  const cutEvent = timeline.events.find((e) => e.kind === 'derate_sent');
  const merged = alertEvent !== undefined && cutEvent !== undefined && cutEvent.tS - alertEvent.tS <= 60;
  const events = timeline.events.filter(
    (e) => MARKED[side].includes(e.kind) && e.tS <= tS && !(merged && e.kind === 'derate_sent'),
  );
  const markLabel = (kind: TimelineEventKind) =>
    kind === 'ai_alert' && merged ? t('ab.marks.alert_and_cut') : t(`ab.marks.${kind}`);
  const markLines = [
    {
      yAxis: LIMIT_TEMP_C,
      lineStyle: { color: colors.danger, type: 'dashed' as const, width: 1.5 },
      label: { formatter: t('ab.chart.limit'), position: 'insideStartTop' as const, color: colors.danger, fontSize: 11 },
    },
    ...events.map((e) => ({
      xAxis: e.tS / 60,
      lineStyle: { color: eventColor[e.kind], width: 1.5 },
      label: {
        formatter: markLabel(e.kind),
        position: 'insideEndTop' as const,
        rotate: 90,
        color: eventColor[e.kind],
        fontSize: 11,
        fontWeight: 600,
      },
    })),
  ];

  const trip = timeline.events.find((e) => e.kind === 'bms_trip');
  const stranded = timeline.events.find((e) => e.kind === 'vehicle_stopped');
  // The stretch after the cut-off during which the bike is stranded, shaded as it grows.
  const strandedArea = (
    side === 'bms' && trip && stranded && trip.tS <= tS
      ? [
          [
            {
              xAxis: trip.tS / 60,
              itemStyle: { color: colors.danger, opacity: 0.1 },
              label: { show: true, formatter: t('ab.marks.vehicle_stopped'), color: colors.danger, fontSize: 11, position: 'insideTop' },
            },
            { xAxis: nowMin },
          ],
        ]
      : []
  ) as NonNullable<MarkAreaComponentOption['data']>;

  const measured = pairs(s.tMin, s.measured, count);
  const last = measured[measured.length - 1];

  const series: (LineSeriesOption | ScatterSeriesOption)[] = [
    {
      name: t('ab.chart.measured'),
      type: 'line',
      showSymbol: false,
      data: measured,
      lineStyle: { width: 2.5, color: colors.warning },
      itemStyle: { color: colors.warning },
      markLine: { silent: true, symbol: 'none', animation: false, data: markLines },
      markArea: { silent: true, animation: false, data: strandedArea },
    },
    {
      name: 'now',
      type: 'scatter',
      data: last ? [last] : [],
      symbolSize: 10,
      itemStyle: { color: colors.warning, borderColor: colors.surface, borderWidth: 2 },
      tooltip: { show: false },
      silent: true,
    },
  ];
  if (side === 'voltify') {
    series.push({
      name: t('ab.chart.expected'),
      type: 'line',
      showSymbol: false,
      data: pairs(s.tMin, s.nominal, count),
      lineStyle: { width: 1.5, type: 'dashed', color: colors.muted },
      itemStyle: { color: colors.muted },
    });
  }

  return {
    animation: false,
    grid: { left: 52, right: 14, top: 28, bottom: 70 },
    legend: {
      bottom: 0,
      itemWidth: 18,
      textStyle: { color: colors.muted, fontSize: 12 },
      data: side === 'voltify' ? [t('ab.chart.measured'), t('ab.chart.expected')] : [t('ab.chart.measured')],
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: colors.surface,
      borderColor: colors.border,
      textStyle: { color: colors.text, fontSize: 12 },
      valueFormatter: (v: unknown) => (typeof v === 'number' ? `${formatNumber(v, currentLang(), 1)} °C` : String(v)),
      axisPointer: { type: 'line', lineStyle: { color: colors.muted } },
    },
    xAxis: {
      type: 'value',
      min: 0,
      max: durationS / 60,
      name: t('ab.chart.axisTime'),
      nameLocation: 'middle',
      nameGap: 28,
      nameTextStyle: { color: colors.muted },
      axisLabel: { color: colors.muted },
      axisLine: { lineStyle: { color: colors.border } },
      splitLine: { lineStyle: { color: colors.border, opacity: 0.5 } },
    },
    yAxis: {
      type: 'value',
      min: Y_MIN,
      max: Y_MAX,
      name: t('ab.chart.temperature'),
      nameTextStyle: { color: colors.muted, align: 'left' },
      axisLabel: { color: colors.muted, formatter: '{value}' },
      splitLine: { lineStyle: { color: colors.border, opacity: 0.5 } },
    },
    series,
  };
}
