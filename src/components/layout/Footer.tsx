import { useTranslation } from 'react-i18next';
import { RiskBadge } from '@/components/ui/RiskBadge';
import { RISK_LEVELS } from '@/lib/riskLevels';

// Always-visible footer: the simulation disclaimer plus the risk legend that
// maps colour to icon and label (colour-blind safe).
export function Footer() {
  const { t } = useTranslation();
  return (
    <footer className="flex shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-border bg-surface px-4 py-2 text-xs text-muted">
      <p className="min-w-0">{t('footer.pocNotice')}</p>
      <div role="group" aria-label={t('risk.legend')} className="hidden items-center gap-2 md:flex">
        <span className="font-medium">{t('risk.legend')}:</span>
        {RISK_LEVELS.map((level) => (
          <RiskBadge key={level} level={level} />
        ))}
      </div>
    </footer>
  );
}
