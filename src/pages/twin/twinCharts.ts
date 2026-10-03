// ECharts option builders for the Digital Twin screen. Each takes the timeline, the
// playback time and the theme colours, and draws only what has happened by then.
import type { BarSeriesOption, HeatmapSeriesOption, LineSeriesOption } from 'echarts/charts';
import type { TFunction } from 'i18next';
import { AI_CONFIG, LIMIT_TEMP_C, type Assessment } from '@/ai';
import type { EChartsOption } from '@/components/charts/echarts';
import type { ChartColors } from '@/components/charts/useChartColors';
import type { Timeline } from '@/eval/timeline';
import { countUpTo, pairs, seriesOf } from '@/lib/timelineSeries';
import { MODULES, MODULE_COLORS } from './moduleStyle';

export interface ChartBase {
  timeline: Timeline;
  tS: number;
  durationS: number;
  colors: ChartColors;
  t: TFunction;
}

const tooltip = (c: ChartColors, unit = '', digits = 1): NonNullable<EChartsOption['tooltip']> => ({
  trigger: 'axis',
  backgroundColor: c.surface,
  borderColor: c.border,
  textStyle: { color: c.text, fontSize: 12 },
  valueFormatter: (v: unknown) => (typeof v === 'number' ? `${v.toFixed(digits)}${unit}` : String(v)),
  axisPointer: { type: 'line', lineStyle: { color: c.muted } },
});

const timeAxis = ({ durationS, colors, t }: ChartBase): NonNullable<EChartsOption['xAxis']> => ({
  type: 'value',
  min: 0,
  max: durationS / 60,
  name: t('twin.charts.axisTime'),
  nameLocation: 'middle',
  nameGap: 28,
  nameTextStyle: { color: colors.muted },
  axisLabel: { color: colors.muted },
  axisLine: { lineStyle: { color: colors.border } },
  splitLine: { lineStyle: { color: colors.border, opacity: 0.5 } },
});

const valueAxis = (c: ChartColors, name: string, min?: number, max?: number): NonNullable<EChartsOption['yAxis']> => ({
  type: 'value',
  min,
  max,
  name,
  nameTextStyle: { color: c.muted, align: 'left' },
  axisLabel: { color: c.muted },
  splitLine: { lineStyle: { color: c.border, opacity: 0.5 } },
});

const grid = { left: 52, right: 14, top: 30, bottom: 72 };
const legend = (c: ChartColors, data: string[]) => ({
  bottom: 0,
  itemWidth: 18,
  textStyle: { color: c.muted, fontSize: 12 },
  data,
});

const line = (name: string, data: [number, number][], color: string, extra: Partial<LineSeriesOption> = {}): LineSeriesOption => ({
  name,
  type: 'line',
  showSymbol: false,
  data,
  lineStyle: { width: 2, color },
  itemStyle: { color },
  ...extra,
});

/** Core temperature: measured, the AI's filtered estimate, and what a healthy pack would be doing. */
export function temperatureOption(b: ChartBase & { showTruth: boolean; etaS: number | null }): EChartsOption {
  const { timeline, tS, colors, t } = b;
  const s = seriesOf(timeline);
  const count = countUpTo(timeline.frames, tS);
  const names = [t('twin.charts.measured'), t('twin.charts.filtered'), t('twin.charts.nominal')];

  const marks: NonNullable<LineSeriesOption['markLine']>['data'] = [
    {
      yAxis: LIMIT_TEMP_C,
      lineStyle: { color: colors.danger, type: 'dashed', width: 1.5 },
      label: { formatter: t('ab.chart.limit'), position: 'insideStartTop', color: colors.danger, fontSize: 11 },
    },
  ];
  const trip = timeline.events.find((e) => e.kind === 'bms_trip' && e.tS <= tS);
  if (trip) {
    marks.push({
      xAxis: trip.tS / 60,
      lineStyle: { color: colors.danger, width: 1.5 },
      label: { formatter: t('ab.marks.bms_trip'), position: 'insideEndTop', rotate: 90, color: colors.danger, fontSize: 11 },
    });
  }
  if (b.etaS !== null && (tS + b.etaS) / 60 <= b.durationS / 60) {
    marks.push({
      xAxis: (tS + b.etaS) / 60,
      lineStyle: { color: colors.warning, type: 'dotted', width: 1.5 },
      label: {
        formatter: `${t('twin.readout.eta')}: ${t('ab.eta.value', { minutes: Math.max(1, Math.round(b.etaS / 60)) })}`,
        position: 'insideEndTop',
        rotate: 90,
        color: colors.warning,
        fontSize: 11,
      },
    });
  }

  const series: LineSeriesOption[] = [
    line(names[0], pairs(s.tMin, s.measured, count), colors.warning, {
      lineStyle: { width: 2.5, color: colors.warning },
      markLine: { silent: true, symbol: 'none', animation: false, data: marks },
    }),
    line(names[1], pairs(s.tMin, s.filtered, count), colors.accent),
    line(names[2], pairs(s.tMin, s.nominal, count), colors.muted, { lineStyle: { width: 1.5, type: 'dashed', color: colors.muted } }),
  ];
  if (b.showTruth) {
    series.push(line(t('twin.charts.trueTemp'), pairs(s.tMin, s.trueTemp, count), colors.text, { lineStyle: { width: 1, type: 'dotted', color: colors.text } }));
  }
  return {
    animation: false,
    grid,
    legend: legend(colors, b.showTruth ? [...names, t('twin.charts.trueTemp')] : names),
    tooltip: tooltip(colors, ' °C'),
    xAxis: timeAxis(b),
    // Fits the data, but always leaves the 65 degC limit in view.
    yAxis: {
      ...valueAxis(colors, '°C'),
      scale: true,
      min: (v: { min: number }) => Math.floor(Math.min(v.min, 60) - 2),
      max: (v: { max: number }) => Math.max(68, Math.ceil(v.max + 2)),
    },
    series,
  };
}

/** The heat the standard model cannot explain, with the level at which it starts to count. */
export function heatOption(b: ChartBase & { showTruth: boolean }): EChartsOption {
  const { timeline, tS, colors, t } = b;
  const s = seriesOf(timeline);
  const count = countUpTo(timeline.frames, tS);
  const names = [t('twin.charts.estimatedHeat')];
  const series: LineSeriesOption[] = [
    line(names[0], pairs(s.tMin, s.heat, count), colors.accent, {
      lineStyle: { width: 2.5, color: colors.accent },
      markLine: {
        silent: true,
        symbol: 'none',
        animation: false,
        data: [
          {
            yAxis: AI_CONFIG.thermal.warnW,
            lineStyle: { color: colors.warning, type: 'dashed', width: 1.5 },
            label: { formatter: `${AI_CONFIG.thermal.warnW} W`, position: 'insideStartTop', color: colors.warning, fontSize: 11 },
          },
        ],
      },
    }),
  ];
  if (b.showTruth) {
    names.push(t('twin.charts.trueHeat'));
    series.push(line(names[1], pairs(s.tMin, s.trueHeat, count), colors.muted, { lineStyle: { width: 1.5, type: 'dashed', color: colors.muted } }));
  }
  return {
    animation: false,
    grid,
    legend: legend(colors, names),
    tooltip: tooltip(colors, ' W'),
    xAxis: timeAxis(b),
    yAxis: valueAxis(colors, 'W', -10),
    series,
  };
}

/** Per-cell deviation from the median over time: a sagging or leaking cell shows up as a band of colour. */
export function cellHeatmapOption(b: ChartBase): EChartsOption {
  // The category axis spans the whole run, so the chart does not rescale as it fills.
  const { timeline, tS, colors, t } = b;
  const s = seriesOf(timeline);
  const total = timeline.frames.length;
  const count = countUpTo(timeline.frames, tS);
  const stride = Math.max(1, Math.ceil(total / 200));
  const columns = Math.ceil(total / stride);
  const cells = s.cellDev[0]?.length ?? 16;

  const xs = Array.from({ length: columns }, (_, c) => ((timeline.frames[Math.min(c * stride, total - 1)]?.tS ?? 0) / 60).toFixed(0));
  const ys = Array.from({ length: cells }, (_, i) => t('twin.charts.cellName', { n: i + 1 }));
  const data: [number, number, number][] = [];
  for (let c = 0; c * stride < count; c++) {
    const dev = s.cellDev[c * stride];
    for (let i = 0; i < cells; i++) data.push([c, i, Math.round(dev[i] * 10) / 10]);
  }

  const heat: HeatmapSeriesOption = { type: 'heatmap', data, progressive: 0, emphasis: { disabled: true } };
  return {
    animation: false,
    grid: { left: 64, right: 14, top: 14, bottom: 92 },
    tooltip: {
      position: 'top',
      backgroundColor: colors.surface,
      borderColor: colors.border,
      textStyle: { color: colors.text, fontSize: 12 },
      formatter: (p: unknown) => {
        const v = (p as { value: [number, number, number] }).value;
        return `${ys[v[1]]} · ${xs[v[0]]} min: ${v[2].toFixed(1)} mV`;
      },
    },
    xAxis: {
      type: 'category',
      data: xs,
      splitArea: { show: false },
      axisLabel: { color: colors.muted, interval: Math.max(0, Math.round(columns / 8) - 1) },
      axisLine: { lineStyle: { color: colors.border } },
      name: t('twin.charts.axisTime'),
      nameLocation: 'middle',
      nameGap: 26,
      nameTextStyle: { color: colors.muted },
    },
    yAxis: { type: 'category', data: ys, inverse: true, axisLabel: { color: colors.muted, fontSize: 10 }, splitArea: { show: false } },
    visualMap: {
      min: -60,
      max: 60,
      orient: 'horizontal',
      left: 'center',
      bottom: 0,
      itemWidth: 12,
      itemHeight: 160,
      calculable: false,
      text: ['+60', '−60 mV'],
      textStyle: { color: colors.muted, fontSize: 11 },
      inRange: { color: [colors.danger, colors.border, '#38bdf8'] },
    },
    series: [heat],
  };
}

/** The 16 cells right now, with the cells the AI has flagged highlighted. */
export function cellsNowOption(b: ChartBase & { assessment: Assessment | null; index: number }): EChartsOption {
  const { timeline, colors, t, assessment, index } = b;
  const s = seriesOf(timeline);
  const dev = index >= 0 ? s.cellDev[index] : [];
  const v = assessment?.voltage;
  const cfg = AI_CONFIG.voltage;
  const sagFlag = v && !assessment.learning && v.sagSocPct >= cfg.sagWarnPct ? v.worstCell : -1;
  const driftFlag = v && !assessment.learning && v.driftSocPct >= cfg.driftWarnPct ? v.driftCell : -1;
  const weakFlag = v && !assessment.learning && v.weakExcessMOhm >= cfg.weakWarnMOhm ? v.weakCell : -1;
  const colorOf = (i: number) => (i === sagFlag ? colors.danger : i === driftFlag ? colors.warning : i === weakFlag ? colors.watch : colors.accent);

  const bars: BarSeriesOption = {
    type: 'bar',
    data: dev.map((value, i) => ({ value: Math.round(value * 10) / 10, itemStyle: { color: colorOf(i) } })),
    barWidth: '60%',
  };
  return {
    animation: false,
    grid: { left: 52, right: 14, top: 14, bottom: 40 },
    tooltip: { ...tooltip(colors, ' mV'), trigger: 'item' },
    xAxis: {
      type: 'category',
      data: dev.map((_, i) => String(i + 1)),
      axisLabel: { color: colors.muted },
      axisLine: { lineStyle: { color: colors.border } },
      name: t('twin.charts.cellName', { n: '' }).trim(),
      nameLocation: 'middle',
      nameGap: 26,
      nameTextStyle: { color: colors.muted },
    },
    yAxis: valueAxis(colors, 'mV'),
    series: [bars],
  };
}

/** The Risk Score over time, stacked by module, with the level thresholds. */
export function riskOption(b: ChartBase): EChartsOption {
  const { timeline, tS, colors, t } = b;
  const s = seriesOf(timeline);
  const count = countUpTo(timeline.frames, tS);
  const [watch, warning, danger] = AI_CONFIG.risk.levelThresholds;
  const levelLines = (
    [
      [watch, colors.watch, t('risk.watch')],
      [warning, colors.warning, t('risk.warning')],
      [danger, colors.danger, t('risk.danger')],
    ] as const
  ).map(([y, color, label]) => ({
    yAxis: y,
    lineStyle: { color, type: 'dashed' as const, width: 1 },
    label: { formatter: `${label} ${y}`, position: 'insideEndTop' as const, color, fontSize: 10 },
  }));

  const names = MODULES.map((m) => t(`twin.modules.${m}`));
  const series: LineSeriesOption[] = MODULES.map((m, i) =>
    line(names[i], pairs(s.tMin, s.contributions[m], count), MODULE_COLORS[m], {
      stack: 'score',
      areaStyle: { opacity: 0.55 },
      lineStyle: { width: 1, color: MODULE_COLORS[m] },
      ...(i === 0 ? { markLine: { silent: true, symbol: 'none', animation: false, data: levelLines } } : {}),
    }),
  );
  return {
    animation: false,
    grid: { ...grid, bottom: 84 },
    legend: legend(colors, names),
    tooltip: tooltip(colors, '', 1),
    xAxis: timeAxis(b),
    yAxis: valueAxis(colors, t('twin.risk.title'), 0, 100),
    series,
  };
}

/** SOH: the AI's estimate, and (optionally) the value the simulator knows it to be. */
export function sohOption(b: ChartBase & { showTruth: boolean }): EChartsOption {
  const { timeline, tS, colors, t } = b;
  const s = seriesOf(timeline);
  const count = countUpTo(timeline.frames, tS);
  const names = [t('twin.charts.sohEstimated')];
  const series: LineSeriesOption[] = [line(names[0], pairs(s.tMin, s.sohEst, count), colors.accent, { lineStyle: { width: 2.5, color: colors.accent } })];
  if (b.showTruth) {
    names.push(t('twin.charts.sohTrue'));
    series.push(line(names[1], pairs(s.tMin, s.sohTrue, count), colors.muted, { lineStyle: { width: 1.5, type: 'dashed', color: colors.muted } }));
  }
  return {
    animation: false,
    grid,
    legend: legend(colors, names),
    tooltip: tooltip(colors, ' %'),
    xAxis: timeAxis(b),
    yAxis: valueAxis(colors, '% SOH', 50, 100),
    series,
  };
}
