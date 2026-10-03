import type { LineSeriesOption, ScatterSeriesOption } from 'echarts/charts';
import type { TFunction } from 'i18next';
import type { ChartColors } from '@/components/charts/useChartColors';
import type { EChartsOption } from '@/components/charts/echarts';
import { PCOE_SOURCE, type PcoeCell } from '@/data/nasaPcoe';
import { estimateSoh, type RealSohResult } from '@/eval/realSoh';
import { currentLang, formatNumber } from '@/lib/format';

/** Real cells: the SOH measured from capacity against the module's estimate from resistance, for one cell. */
export function realSohOption(result: RealSohResult, cell: PcoeCell, colors: ChartColors, t: TFunction): EChartsOption {
  const summary = result.cells.find((c) => c.cell === cell)!;
  const lang = currentLang();
  const points = result.points[cell];
  // The end of life of the experiment is a capacity of 1.4 Ah, which is this height for this cell.
  const eol = (PCOE_SOURCE.endOfLifeAh / summary.cap0Ah) * 100;

  const series: (LineSeriesOption | ScatterSeriesOption)[] = [
    {
      name: t('evidence.real.series.measured'),
      type: 'line',
      showSymbol: false,
      data: result.capacitySoh[cell].map(([n, soh]) => [n, soh * 100]),
      lineStyle: { width: 2.5, color: colors.accent },
      itemStyle: { color: colors.accent },
      markLine: {
        silent: true,
        symbol: 'none',
        animation: false,
        data: [
          {
            yAxis: eol,
            lineStyle: { color: colors.danger, type: 'dashed' as const, width: 1.2 },
            label: { formatter: t('evidence.real.eol'), color: colors.danger, fontSize: 11, position: 'insideEndTop' as const },
          },
        ],
      },
    },
    {
      name: t('evidence.real.series.module', { gamma: formatNumber(result.moduleGamma, lang, 0) }),
      type: 'scatter',
      symbol: 'circle',
      symbolSize: 4,
      itemStyle: { color: colors.warning, opacity: 0.7 },
      data: points.map((p) => [p.cycle, estimateSoh(p, result.moduleGamma) * 100]),
    },
    {
      name: t('evidence.real.series.others', { gamma: formatNumber(summary.gammaOthers, lang, 2) }),
      type: 'scatter',
      symbol: 'triangle',
      symbolSize: 4,
      itemStyle: { color: colors.text, opacity: 0.6 },
      data: points.map((p) => [p.cycle, estimateSoh(p, summary.gammaOthers) * 100]),
    },
  ];

  return {
    animation: false,
    grid: { left: 56, right: 16, top: 24, bottom: 104 },
    legend: { bottom: 0, itemWidth: 18, itemGap: 10, textStyle: { color: colors.muted, fontSize: 11 } },
    tooltip: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      textStyle: { color: colors.text, fontSize: 12 },
      trigger: 'item',
      formatter: (p: unknown) => {
        const v = (p as { value?: number[] }).value;
        return v ? t('evidence.real.tooltip', { cycle: Math.round(v[0]), soh: `${formatNumber(v[1], currentLang(), 1)} %` }) : '';
      },
    },
    xAxis: {
      type: 'value',
      min: 0,
      name: t('evidence.real.axisX'),
      nameLocation: 'middle',
      nameGap: 30,
      nameTextStyle: { color: colors.muted },
      axisLabel: { color: colors.muted },
      axisLine: { lineStyle: { color: colors.border } },
      splitLine: { lineStyle: { color: colors.border, opacity: 0.5 } },
    },
    yAxis: {
      type: 'value',
      min: 45,
      max: 105,
      name: t('evidence.real.axisY'),
      nameTextStyle: { color: colors.muted, align: 'left' },
      axisLabel: { color: colors.muted },
      splitLine: { lineStyle: { color: colors.border, opacity: 0.5 } },
    },
    series,
  };
}
