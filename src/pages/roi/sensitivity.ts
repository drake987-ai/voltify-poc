import type { TFunction } from 'i18next';
import type { ChartColors } from '@/components/charts/useChartColors';
import type { EChartsOption } from '@/components/charts/echarts';
import { computeRoi, type RoiInputs, type RoiScenario } from '@/business/roi';
import { currentLang, formatNumber } from '@/lib/format';

export const SENSITIVITY_MAX_PCT = 50;

/** Net benefit per year as the life extension varies, every other lever held at the careful case. */
export function sensitivityCurve(inputs: RoiInputs, base: RoiScenario, maxPct = SENSITIVITY_MAX_PCT): [number, number][] {
  const out: [number, number][] = [];
  for (let e = 0; e <= maxPct; e += 1) {
    out.push([e, computeRoi(inputs, { ...base, lifeExtensionPct: e }).netPerYearVnd / 1e9]);
  }
  return out;
}

interface Args {
  inputs: RoiInputs;
  careful: RoiScenario;
  target: RoiScenario;
  breakEvenPct: number | null;
  colors: ChartColors;
  t: TFunction;
}

export function buildSensitivityOption({ inputs, careful, target, breakEvenPct, colors, t }: Args): EChartsOption {
  const curve = sensitivityCurve(inputs, careful);
  const line = (x: number, label: string, color: string, dash: 'solid' | 'dashed' | 'dotted') => ({
    xAxis: Math.min(x, SENSITIVITY_MAX_PCT),
    lineStyle: { color, type: dash, width: 1.5 },
    label: { formatter: label, color, fontSize: 11, position: 'insideEndTop' as const, rotate: 90 },
  });
  const marks = [
    ...(breakEvenPct !== null && breakEvenPct <= SENSITIVITY_MAX_PCT
      ? [line(breakEvenPct, t('roi.chart.breakEven', { pct: formatNumber(breakEvenPct, currentLang(), 1) }), colors.warning, 'dashed')]
      : []),
    line(careful.lifeExtensionPct, t('roi.cases.careful.title'), colors.accent, 'solid'),
    line(target.lifeExtensionPct, t('roi.cases.target.title'), colors.text, 'dotted'),
  ];

  return {
    animation: false,
    grid: { left: 60, right: 16, top: 24, bottom: 56 },
    tooltip: {
      trigger: 'axis',
      backgroundColor: colors.surface,
      borderColor: colors.border,
      textStyle: { color: colors.text, fontSize: 12 },
      valueFormatter: (v: unknown) => (typeof v === 'number' ? t('roi.units.billion', { value: formatNumber(v, currentLang(), 2) }) : String(v)),
      axisPointer: { type: 'line', lineStyle: { color: colors.muted } },
    },
    xAxis: {
      type: 'value',
      min: 0,
      max: SENSITIVITY_MAX_PCT,
      name: t('roi.chart.axisX'),
      nameLocation: 'middle',
      nameGap: 30,
      nameTextStyle: { color: colors.muted },
      axisLabel: { color: colors.muted },
      axisLine: { lineStyle: { color: colors.border } },
      splitLine: { lineStyle: { color: colors.border, opacity: 0.5 } },
    },
    yAxis: {
      type: 'value',
      name: t('roi.chart.axisY'),
      nameTextStyle: { color: colors.muted, align: 'left' },
      axisLabel: { color: colors.muted },
      splitLine: { lineStyle: { color: colors.border, opacity: 0.5 } },
    },
    series: [
      {
        name: t('roi.chart.series'),
        type: 'line',
        showSymbol: false,
        data: curve,
        lineStyle: { width: 2.5, color: colors.accent },
        itemStyle: { color: colors.accent },
        markLine: {
          silent: true,
          symbol: 'none',
          animation: false,
          data: [{ yAxis: 0, lineStyle: { color: colors.muted, width: 1 }, label: { show: false } }, ...marks],
        },
      },
    ],
  };
}
