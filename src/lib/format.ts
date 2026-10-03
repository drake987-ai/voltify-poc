import i18n from '@/i18n';

/** The language in use right now, for formatting done outside React (chart tooltips run when hovered). */
export const currentLang = (): string => i18n.resolvedLanguage ?? 'vi';

/** Locale-aware number formatting (Vietnamese uses a decimal comma). */
export function formatNumber(value: number, language: string, decimals = 1): string {
  return value.toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
