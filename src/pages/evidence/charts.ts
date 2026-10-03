import type { BarSeriesOption, LineSeriesOption, ScatterSeriesOption } from 'echarts/charts';
import type { TFunction } from 'i18next';
import type { ChartColors } from '@/components/charts/useChartColors';
import type { EChartsOption } from '@/components/charts/echarts';
import type { Brand } from '@/adapters';
import type { EvidenceSummary } from '@/eval/evidence';
import { currentLang, formatNumber } from '@/lib/format';

const axisBase = (c: ChartColors) => ({
  nameTextStyle: { color: c.muted },
  axisLabel: { color: c.muted },
  axisLine: { lineStyle: { color: c.border } },
  splitLine: { lineStyle: { color: c.border, opacity: 0.5 } },
});

const tooltipBase = (c: ChartColors) => ({
  backgroundColor: c.surface,
  borderColor: c.border,
  textStyle: { color: c.text, fontSize: 12 },
});

/** ROC: true-positive rate against false-positive rate as the Risk Score threshold moves, with the Warning level marked. */
export function rocOption(summary: EvidenceSummary, colors: ChartColors, t: TFunction): EChartsOption {
  const pct = (x: number) => `${formatNumber(x * 100, currentLang(), 1)} %`;
  const curve = summary.roc.map((p) => [p.fpr, p.tpr, p.threshold]);
  const marks = [25, 50, 75].map((thr) => summary.roc.find((p) => p.threshold === thr)!);
  const series: (LineSeriesOption | ScatterSeriesOption)[] = [
    {
      name: t('evidence.roc.curve'),
      type: 'line',
      showSymbol: false,
      data: curve,
      lineStyle: { width: 2.5, color: colors.accent },
      itemStyle: { color: colors.accent },
    },
    {
      name: t('evidence.roc.chance'),
      type: 'line',
      showSymbol: false,
      data: [
        [0, 0],
        [1, 1],
      ],
      lineStyle: { width: 1.5, type: 'dashed', color: colors.muted },
      itemStyle: { color: colors.muted },
      tooltip: { show: false },
    },
    {
      name: t('evidence.roc.thresholds'),
      type: 'scatter',
      data: marks.map((p) => ({
        value: [p.fpr, p.tpr, p.threshold],
        // The three points sit close together near the top left: only the Warning level is labelled, the others by tooltip.
        label: { show: p.threshold === 50, formatter: t('evidence.roc.pointLabel', { threshold: p.threshold }), position: 'right' as const, color: colors.text, fontSize: 11 },
      })),
      symbol: 'diamond',
      symbolSize: 11,
      itemStyle: { color: colors.warning, borderColor: colors.surface, borderWidth: 2 },
    },
  ];
  return {
    animation: false,
    grid: { left: 56, right: 16, top: 24, bottom: 76 },
    legend: { bottom: 0, itemWidth: 20, textStyle: { color: colors.muted, fontSize: 12 } },
    tooltip: {
      ...tooltipBase(colors),
      trigger: 'item',
      formatter: (p: unknown) => {
        const v = (p as { value?: number[] }).value;
        if (!v || v.length < 3) return '';
        return t('evidence.roc.tooltip', { threshold: v[2], tpr: pct(v[1]), fpr: pct(v[0]) });
      },
    },
    xAxis: { type: 'value', min: 0, max: 1, name: t('evidence.roc.axisX'), nameLocation: 'middle', nameGap: 30, ...axisBase(colors) },
    yAxis: { type: 'value', min: 0, max: 1, name: t('evidence.roc.axisY'), nameTextStyle: { color: colors.muted, align: 'left' }, axisLabel: { color: colors.muted }, splitLine: { lineStyle: { color: colors.border, opacity: 0.5 } } },
    series,
  };
}

/** Lead time: how many events were alerted this many minutes before the BMS cut-off, with the 30-45 minute target band. */
export const LEAD_BIN_MIN = 2;
export const LEAD_MAX_MIN = 46;
export const TARGET_BAND_MIN = [30, 45] as const;

export function leadBins(values: readonly number[]): { label: string; count: number }[] {
  const bins = Array.from({ length: LEAD_MAX_MIN / LEAD_BIN_MIN }, (_, i) => ({ label: String(i * LEAD_BIN_MIN), count: 0 }));
  for (const s of values) {
    const i = Math.min(bins.length - 1, Math.max(0, Math.floor(s / 60 / LEAD_BIN_MIN)));
    bins[i].count++;
  }
  return bins;
}

export function leadOption(values: readonly number[], colors: ChartColors, t: TFunction): EChartsOption {
  const bins = leadBins(values);
  const series: BarSeriesOption[] = [
    {
      name: t('evidence.lead.series'),
      type: 'bar',
      data: bins.map((b) => b.count),
      itemStyle: { color: colors.accent },
      barCategoryGap: '12%',
      markArea: {
        silent: true,
        data: [
          [
            {
              xAxis: String(Math.floor(TARGET_BAND_MIN[0] / LEAD_BIN_MIN) * LEAD_BIN_MIN),
              itemStyle: { color: colors.warning, opacity: 0.14 },
              label: { show: true, formatter: t('evidence.lead.target'), color: colors.warning, position: 'insideTop' as const, fontSize: 11 },
            },
            { xAxis: String(Math.floor((TARGET_BAND_MIN[1] - 1) / LEAD_BIN_MIN) * LEAD_BIN_MIN) },
          ],
        ],
      },
    },
  ];
  return {
    animation: false,
    grid: { left: 52, right: 16, top: 28, bottom: 50 },
    tooltip: {
      ...tooltipBase(colors),
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (p: unknown) => {
        const a = (p as { name: string; value: number }[])[0];
        const from = Number(a.name);
        return t('evidence.lead.tooltip', { from, to: from + LEAD_BIN_MIN, count: a.value });
      },
    },
    xAxis: { type: 'category', data: bins.map((b) => b.label), name: t('evidence.lead.axisX'), nameLocation: 'middle', nameGap: 30, ...axisBase(colors) },
    yAxis: { type: 'value', minInterval: 1, name: t('evidence.lead.axisY'), nameTextStyle: { color: colors.muted, align: 'left' }, axisLabel: { color: colors.muted }, splitLine: { lineStyle: { color: colors.border, opacity: 0.5 } } },
    series,
  };
}

/** SOH: the estimate against the simulator's truth for every pack, per brand, with the y = x line. */
export function sohOption(summary: EvidenceSummary, colors: ChartColors, t: TFunction): EChartsOption {
  const brandColor: Record<Brand, string> = { A: colors.accent, B: colors.warning, C: colors.text };
  const symbol: Record<Brand, 'circle' | 'rect' | 'triangle'> = { A: 'circle', B: 'rect', C: 'triangle' };
  const pct = (x: number) => `${formatNumber(x, currentLang(), 1)} %`;
  const series: (ScatterSeriesOption | LineSeriesOption)[] = (['A', 'B', 'C'] as const).map((b) => ({
    name: t(`brands.${b}`),
    type: 'scatter',
    symbol: symbol[b],
    symbolSize: 6,
    itemStyle: { color: brandColor[b], opacity: 0.7 },
    data: summary.soh.points.filter((p) => p.brand === b).map((p) => [p.truth * 100, p.est * 100]),
  }));
  series.push({
    name: t('evidence.soh.ideal'),
    type: 'line',
    showSymbol: false,
    data: [
      [60, 60],
      [105, 105],
    ],
    lineStyle: { width: 1.5, type: 'dashed', color: colors.muted },
    itemStyle: { color: colors.muted },
    tooltip: { show: false },
  });
  return {
    animation: false,
    grid: { left: 56, right: 16, top: 24, bottom: 76 },
    legend: { bottom: 0, itemWidth: 20, textStyle: { color: colors.muted, fontSize: 12 } },
    tooltip: {
      ...tooltipBase(colors),
      trigger: 'item',
      formatter: (p: unknown) => {
        const v = (p as { value?: number[] }).value;
        return v ? t('evidence.soh.tooltip', { truth: pct(v[0]), est: pct(v[1]) }) : '';
      },
    },
    xAxis: { type: 'value', min: 60, max: 105, name: t('evidence.soh.axisX'), nameLocation: 'middle', nameGap: 30, ...axisBase(colors) },
    yAxis: { type: 'value', min: 60, max: 105, name: t('evidence.soh.axisY'), nameTextStyle: { color: colors.muted, align: 'left' }, axisLabel: { color: colors.muted }, splitLine: { lineStyle: { color: colors.border, opacity: 0.5 } } },
    series,
  };
}
