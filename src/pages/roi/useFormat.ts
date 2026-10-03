import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { formatNumber } from '@/lib/format';
import type { TraceFormat } from './trace';

/** Number and money formatting for the ROI screen in the language in use. */
export function useFormat(): TraceFormat & { vndExact: (x: number) => string; lang: string } {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'vi';
  return useMemo(() => {
    const num = (x: number, dp = 0) => formatNumber(x, lang, dp);
    const vnd = (x: number): string => {
      const abs = Math.abs(x);
      if (abs >= 1e9) return t('roi.units.billion', { value: num(x / 1e9, 2) });
      if (abs >= 1e6) return t('fleet.units.millionVnd', { value: num(x / 1e6, 1) });
      return t('fleet.units.vnd', { value: num(Math.round(x), 0) });
    };
    const vndExact = (x: number) => t('fleet.units.vnd', { value: num(Math.round(x), 0) });
    const pct = (x: number, dp = 1) => `${num(x, dp)} %`;
    return { num, vnd, pct, vndExact, lang };
  }, [t, lang]);
}
