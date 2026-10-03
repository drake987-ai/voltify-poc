import { useMemo } from 'react';
import { useUiStore } from '@/store/uiStore';

export interface ChartColors {
  text: string;
  muted: string;
  border: string;
  surface: string;
  accent: string;
  safe: string;
  watch: string;
  warning: string;
  danger: string;
}

const read = (name: string, fallback: string): string => {
  if (typeof document === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
};

/** Chart colours taken from the CSS theme tokens, refreshed when the theme changes. */
export function useChartColors(): ChartColors {
  const theme = useUiStore((s) => s.theme);
  return useMemo(
    () => ({
      text: read('--c-text', '#e7f2ed'),
      muted: read('--c-muted', '#9db3a9'),
      border: read('--c-border', '#23352e'),
      surface: read('--c-surface', '#101a17'),
      accent: read('--c-accent', '#2dd4a7'),
      safe: read('--c-risk-safe', '#34d399'),
      watch: read('--c-risk-watch', '#facc15'),
      warning: read('--c-risk-warning', '#fb923c'),
      danger: read('--c-risk-danger', '#f87171'),
    }),
    // `theme` is the trigger: the CSS variables behind these values change with it.
    [theme],
  );
}
