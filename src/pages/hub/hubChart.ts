import type { LineSeriesOption } from 'echarts/charts';
import type { TFunction } from 'i18next';
import type { ChartColors } from '@/components/charts/useChartColors';
import type { EChartsOption } from '@/components/charts/echarts';
import { BRANDS, type Brand } from '@/adapters';
import { AI_CONFIG } from '@/ai';
import type { HubRun } from '@/eval/hub';
import { currentLang, formatNumber } from '@/lib/format';

interface Args {
  run: HubRun;
  tS: number;
  colors: ChartColors;
  t: TFunction;
}

/** Three lines with three dash styles and three symbols, so the brands differ by more than colour. */
const LOOK: Record<Brand, { type: 'solid' | 'dashed' | 'dotted'; symbol: 'circle' | 'rect' | 'triangle' }> = {
  A: { type: 'solid', symbol: 'circle' },
  B: { type: 'dashed', symbol: 'rect' },
  C: { type: 'dotted', symbol: 'triangle' },
};

export function buildHubOption({ run, tS, colors, t }: Args): EChartsOption {
  const color: Record<Brand, string> = { A: colors.accent, B: colors.warning, C: colors.text };
  const warn = AI_CONFIG.risk.levelThresholds[1];

  const series: LineSeriesOption[] = BRANDS.map((b, i) => {
    const frames = run.streams[b].frames.filter((f) => f.tS <= tS);
    return {
      name: t(`brands.${b}`),
      type: 'line',
      showSymbol: true,
      symbol: LOOK[b].symbol,
      symbolSize: 5,
      // Frames arrive at different cadences; a symbol on every fifth point keeps the denser feeds legible.
      showAllSymbol: false,
      data: frames.map((f) => [f.tS / 60, f.assessment.risk.score]),
      lineStyle: { width: 2.2, color: color[b], type: LOOK[b].type },
      itemStyle: { color: color[b] },
      ...(i === 0
        ? {
            markLine: {
              silent: true,
              symbol: 'none',
              animation: false,
              data: [
                {
                  yAxis: warn,
                  lineStyle: { color: colors.warning, type: 'dashed' as const, width: 1 },
                  label: { formatter: t('hub.unified.warnLine', { score: warn }), color: colors.warning, fontSize: 11, position: 'insideStartTop' as const },
                },
              ],
            },
          }
        : {}),
    };
  });

  return {
    animation: false,
    grid: { left: 52, right: 14, top: 28, bottom: 70 },
    legend: { bottom: 0, itemWidth: 22, textStyle: { color: colors.muted, fontSize: 12 }, data: BRANDS.map((b) => t(`brands.${b}`)) },
    tooltip: {
      trigger: 'axis',
      backgroundColor: colors.surface,
      borderColor: colors.border,
      textStyle: { color: colors.text, fontSize: 12 },
      valueFormatter: (v: unknown) => (typeof v === 'number' ? formatNumber(v, currentLang(), 1) : String(v)),
      axisPointer: { type: 'line', lineStyle: { color: colors.muted } },
    },
    xAxis: {
      type: 'value',
      min: 0,
      max: run.spec.durationS / 60,
      name: t('hub.unified.axisTime'),
      nameLocation: 'middle',
      nameGap: 28,
      nameTextStyle: { color: colors.muted },
      axisLabel: { color: colors.muted },
      axisLine: { lineStyle: { color: colors.border } },
      splitLine: { lineStyle: { color: colors.border, opacity: 0.5 } },
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 100,
      name: t('hub.unified.axisScore'),
      nameTextStyle: { color: colors.muted, align: 'left' },
      axisLabel: { color: colors.muted },
      splitLine: { lineStyle: { color: colors.border, opacity: 0.5 } },
    },
    series,
  };
}
