import { Eye, Flame, ShieldCheck, TriangleAlert, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { RiskLevel } from '@/lib/riskLevels';

// Colour is never the only signal: each level has its own icon and a text label.
const META: Record<RiskLevel, { Icon: LucideIcon; classes: string }> = {
  safe: { Icon: ShieldCheck, classes: 'border-risk-safe/50 bg-risk-safe/10 text-risk-safe' },
  watch: { Icon: Eye, classes: 'border-risk-watch/50 bg-risk-watch/10 text-risk-watch' },
  warning: {
    Icon: TriangleAlert,
    classes: 'border-risk-warning/50 bg-risk-warning/10 text-risk-warning',
  },
  danger: { Icon: Flame, classes: 'border-risk-danger/50 bg-risk-danger/10 text-risk-danger' },
};

export function RiskBadge({ level }: { level: RiskLevel }) {
  const { t } = useTranslation();
  const { Icon, classes } = META[level];
  return (
    <span
      data-risk={level}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${classes}`}
    >
      <Icon aria-hidden className="size-3.5" />
      {t(`risk.${level}`)}
    </span>
  );
}
