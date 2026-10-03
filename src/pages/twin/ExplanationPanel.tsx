import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { explainAssessment, type Assessment, type RecommendedAction } from '@/ai';
import { Card } from '@/components/ui/Card';
import { formatNumber } from '@/lib/format';
import { MODULE_COLORS } from './moduleStyle';

function actionText(t: TFunction, a: RecommendedAction): string {
  const percent = Math.round((a.value ?? 0) * 100);
  switch (a.code) {
    case 'monitor':
      return t('twin.actions.monitor');
    case 'derate':
      return t('twin.actions.derate', { percent });
    case 'swap':
      return t('twin.actions.swap');
    case 'isolate':
      return t('twin.actions.isolate');
    case 'reduce_charge':
      return t('twin.actions.reduce_charge', { percent });
    case 'schedule_maintenance':
      return t('twin.actions.schedule_maintenance');
  }
}

/** Why the Risk Score is what it is: every signal with its value, threshold, share of the score and confidence. */
export function ExplanationPanel({ assessment }: { assessment: Assessment | null }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'vi';
  const reasons = assessment ? explainAssessment(assessment).filter((e) => Number.isFinite(e.value)) : [];
  const unit = (u: string) => (u === 'min' ? t('twin.units.min') : u);
  const num = (x: number) => formatNumber(x, lang, Math.abs(x) >= 100 ? 0 : 1);

  return (
    <Card className="flex flex-col">
      <h2 className="text-base font-semibold">{t('twin.risk.why')}</h2>

      {assessment?.learning ? <p className="mt-2 text-sm text-muted">{t('twin.risk.learning')}</p> : null}

      {reasons.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{t('twin.risk.empty')}</p>
      ) : (
        <ol className="mt-3 space-y-3">
          {reasons.slice(0, 5).map((e) => (
            <li key={e.signal} className="rounded-lg border border-border bg-surface-2 p-3">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 text-sm font-semibold">
                  <span aria-hidden className="mr-2 inline-block size-2.5 rounded-sm align-baseline" style={{ background: MODULE_COLORS[e.module] }} />
                  {t(`twin.signals.${e.signal}.name`)}
                  {e.cell !== undefined ? <span className="ml-2 font-normal text-muted">({t('twin.charts.cellName', { n: e.cell + 1 })})</span> : null}
                </p>
                <p className="shrink-0 text-sm font-semibold">{t('twin.risk.points', { points: formatNumber(e.points, lang, 1) })}</p>
              </div>
              <p className="mt-1 text-xs leading-snug text-muted">{t(`twin.signals.${e.signal}.hint`)}</p>
              <p className="mt-2 text-xs text-text">
                <span className="font-semibold">
                  {num(e.value)} {unit(e.unit)}
                </span>
                {' · '}
                {t('twin.risk.range', { threshold: num(e.threshold), limit: num(e.limit), unit: unit(e.unit) })}
                {' · '}
                {t('twin.risk.confidence', { percent: Math.round(e.confidence * 100) })}
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border" role="presentation">
                <div className="h-full rounded-full" style={{ width: `${Math.round(e.severity * 100)}%`, background: MODULE_COLORS[e.module] }} />
              </div>
            </li>
          ))}
        </ol>
      )}

      {assessment && assessment.actions.length > 0 ? (
        <div className="mt-4 border-t border-border pt-3">
          <h3 className="text-sm font-semibold">{t('twin.actions.title')}</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
            {assessment.actions.map((a) => (
              <li key={a.code}>{actionText(t, a)}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}
