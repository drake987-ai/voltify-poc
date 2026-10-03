import { useEffect, useRef } from 'react';
import { echarts, type EChartsOption } from './echarts';

interface EChartProps {
  option: EChartsOption;
  /** Height in px. The width follows the container. */
  height: number;
  /** Accessible name of the chart (also read out for screen readers). */
  label: string;
  className?: string;
}

/** Thin React wrapper: one ECharts instance per mount, resized with its container. */
export function EChart({ option, height, label, className = '' }: EChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<ReturnType<typeof echarts.init> | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const instance = echarts.init(el, undefined, { renderer: 'canvas' });
    chart.current = instance;
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(el);
    return () => {
      observer.disconnect();
      instance.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    // Not merged: the option describes the whole chart each time, so removed series disappear.
    chart.current?.setOption(option, { notMerge: true, lazyUpdate: true });
  }, [option]);

  return <div ref={ref} role="img" aria-label={label} className={className} style={{ height }} />;
}
