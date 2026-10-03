import { useTranslation } from 'react-i18next';
import type { Assessment } from '@/ai';
import { AI_CONFIG } from '@/ai';
import { Card } from '@/components/ui/Card';
import { RiskBadge } from '@/components/ui/RiskBadge';
import { MODULES, MODULE_COLORS } from './moduleStyle';

const BANDS = [
  { from: 0, to: AI_CONFIG.risk.levelThresholds[0], color: 'var(--c-risk-safe)' },
  { from: AI_CONFIG.risk.levelThresholds[0], to: AI_CONFIG.risk.levelThresholds[1], color: 'var(--c-risk-watch)' },
  { from: AI_CONFIG.risk.levelThresholds[1], to: AI_CONFIG.risk.levelThresholds[2], color: 'var(--c-risk-warning)' },
  { from: AI_CONFIG.risk.levelThresholds[2], to: 100, color: 'var(--c-risk-danger)' },
];

export function RiskPanel({ assessment }: { assessment: Assessment | null }) {
  const { t } = useTranslation();
  const score = assessment?.risk.score ?? 0;
  const contributions = assessment?.risk.contributions;

  return (
    <Card>
      <h2 className="text-base font-semibold">{t('twin.risk.title')}</h2>

      <div className="mt-2 flex items-center gap-3">
        <span className="text-5xl font-semibold tracking-tight">{score.toFixed(0)}</span>
        <div className="space-y-1">
          {assessment ? <RiskBadge level={assessment.risk.level} /> : null}
          <p className="text-xs text-muted">{t('twin.risk.scoreOf')}</p>
        </div>
      </div>

      {/* Meter: the four level bands with a marker at the score. The band edges are labelled in text. */}
      <div className="relative mt-4 h-3 overflow-hidden rounded-full" role="presentation">
        {BANDS.map((b) => (
          <div
            key={b.from}
            className="absolute inset-y-0 opacity-35"
            style={{ left: `${b.from}%`, width: `${b.to - b.from}%`, background: b.color }}
          />
        ))}
        <div
          className="absolute inset-y-[-2px] w-1 -translate-x-1/2 rounded bg-text"
          style={{ left: `${Math.min(100, Math.max(0, score))}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted">
        <span>0</span>
        <span>{AI_CONFIG.risk.levelThresholds[0]}</span>
        <span>{AI_CONFIG.risk.levelThresholds[1]}</span>
        <span>{AI_CONFIG.risk.levelThresholds[2]}</span>
        <span>100</span>
      </div>

      {/* Contribution of each module; the segments add up to the score. */}
      <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-surface-2" role="presentation">
        {MODULES.map((m) => (
          <div
            key={m}
            style={{ width: `${score > 0 && contributions ? (contributions[m] / Math.max(score, 1e-9)) * 100 : 0}%`, background: MODULE_COLORS[m] }}
          />
        ))}
      </div>
      <ul className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
        {MODULES.map((m) => (
          <li key={m} className="flex items-center gap-2">
            <span aria-hidden className="size-2.5 shrink-0 rounded-sm" style={{ background: MODULE_COLORS[m] }} />
            <span className="min-w-0 flex-1 truncate text-muted">{t(`twin.modules.${m}`)}</span>
            <span className="font-semibold text-text">{(contributions?.[m] ?? 0).toFixed(1)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
