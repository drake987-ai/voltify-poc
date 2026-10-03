/** Locale-aware number formatting (Vietnamese uses a decimal comma). */
export function formatNumber(value: number, language: string, decimals = 1): string {
  return value.toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
