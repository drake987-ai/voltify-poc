import { useTranslation } from 'react-i18next';
import { DEFAULT_ASSUMPTIONS, type AssumptionId, type AssumptionValues } from '@/business/assumptions';
import { formatNumber } from '@/lib/format';

/** The assumptions behind a figure, each with its value and the reason it was chosen (CLAUDE.md section 3, rule 5). */
export function AssumptionList({ ids, values }: { ids: readonly AssumptionId[]; values: Partial<AssumptionValues> }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'vi';

  const show = (id: AssumptionId): string => {
    const v = values[id] ?? DEFAULT_ASSUMPTIONS[id].value;
    switch (DEFAULT_ASSUMPTIONS[id].unit) {
      case 'VND':
        return t('fleet.units.vnd', { value: Math.round(v).toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US') });
      case 'degC':
        return `${formatNumber(v, lang, 0)} °C`;
      case 'fraction':
        return formatNumber(v, lang, 2);
      case 'efcPerDay':
        return formatNumber(v, lang, 1);
    }
  };

  return (
    <ul className="space-y-2 text-sm">
      {ids.map((id) => (
        <li key={id} className="rounded-lg border border-border bg-surface-2 p-2">
          <p className="flex justify-between gap-3 font-medium">
            <span>{t(`assumptions.${id}.label`)}</span>
            <span className="shrink-0">{show(id)}</span>
          </p>
          <p className="mt-0.5 text-xs text-muted">{t(`assumptions.${id}.why`)}</p>
        </li>
      ))}
    </ul>
  );
}
