import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import type { EvidenceSummary, Rate } from '@/eval/evidence';
import { formatNumber } from '@/lib/format';

function RateStat({ label, formula, hint, r }: { label: string; formula: string; hint: string; r: Rate }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'vi';
  const pct = (x: number) => `${formatNumber(x * 100, lang, 1)} %`;
  return (
    <div className="min-w-0 rounded-xl border border-border bg-surface p-3">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-accent">{r.value === null ? '—' : pct(r.value)}</p>
      <p className="mt-0.5 text-xs text-text">
        {formula} = {r.num}/{r.den}
      </p>
      {r.lo !== null && r.hi !== null ? (
        <p className="text-xs text-muted">{t('evidence.headline.interval', { lo: pct(r.lo), hi: pct(r.hi) })}</p>
      ) : null}
      <p className="mt-1 text-[11px] leading-snug text-muted">{hint}</p>
    </div>
  );
}

/** Precision, recall, false-alarm rate, ROC area and lead time, all computed from the batch. */
export function Headline({ summary }: { summary: EvidenceSummary }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'vi';
  const s = summary;
  const min = (sec: number | null) => (sec === null ? '—' : formatNumber(sec / 60, lang, 1));
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <RateStat label={t('evidence.headline.recall')} formula="TP / (TP + FN)" hint={t('evidence.headline.recallHint')} r={s.recall} />
        <RateStat label={t('evidence.headline.precision')} formula="TP / (TP + FP)" hint={t('evidence.headline.precisionHint')} r={s.precision} />
        <RateStat label={t('evidence.headline.far')} formula="FP / (FP + TN)" hint={t('evidence.headline.farHint')} r={s.falseAlarmRate} />
        <div className="min-w-0 rounded-xl border border-border bg-surface p-3">
          <p className="text-xs font-medium text-muted">{t('evidence.headline.auc')}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-accent">{s.auc === null ? '—' : formatNumber(s.auc, lang, 3)}</p>
          <p className="mt-1 text-[11px] leading-snug text-muted">{t('evidence.headline.aucHint')}</p>
        </div>
        <div className="min-w-0 rounded-xl border border-border bg-surface p-3">
          <p className="text-xs font-medium text-muted">{t('evidence.headline.lead')}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-accent">
            {s.leadTime.mean === null ? '—' : t('evidence.headline.minutes', { value: min(s.leadTime.mean) })}
          </p>
          <p className="mt-0.5 text-xs text-text">
            {t('evidence.headline.leadRange', { min: min(s.leadTime.min), max: min(s.leadTime.max), n: s.leadTime.n })}
          </p>
          <p className="mt-1 text-[11px] leading-snug text-muted">{t('evidence.headline.leadHint')}</p>
        </div>
      </div>
      <p className="text-xs leading-snug text-muted">
        {t('evidence.headline.sample', {
          packs: s.packs,
          events: s.events,
          normals: s.normals,
          prevalence: formatNumber((s.prevalence.value ?? 0) * 100, lang, 1),
        })}
      </p>
    </div>
  );
}

/** The 2 x 2 table of what the AI said against what the simulator knew. */
export function ConfusionMatrix({ summary }: { summary: EvidenceSummary }) {
  const { t } = useTranslation();
  const c = summary.confusion;
  const cell = (n: number, kind: 'good' | 'bad', label: string) => (
    <td className={`border border-border p-3 text-center align-middle ${kind === 'good' ? 'bg-risk-safe/10' : 'bg-risk-warning/10'}`}>
      <span className="block text-2xl font-semibold">{n}</span>
      <span className="block text-[11px] text-muted">{label}</span>
    </td>
  );
  return (
    <Card>
      <h3 className="text-base font-semibold">{t('evidence.confusion.title')}</h3>
      <p className="mt-1 text-xs leading-snug text-muted">{t('evidence.confusion.intro')}</p>
      <table className="mt-3 w-full border-collapse text-sm">
        <thead>
          <tr>
            <th scope="col" className="p-2" />
            <th scope="col" className="p-2 text-xs font-medium text-muted">{t('evidence.confusion.alerted')}</th>
            <th scope="col" className="p-2 text-xs font-medium text-muted">{t('evidence.confusion.quiet')}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row" className="p-2 text-left text-xs font-medium text-muted">{t('evidence.confusion.event')}</th>
            {cell(c.tp, 'good', t('evidence.confusion.tp'))}
            {cell(c.fn, 'bad', t('evidence.confusion.fn'))}
          </tr>
          <tr>
            <th scope="row" className="p-2 text-left text-xs font-medium text-muted">{t('evidence.confusion.normal')}</th>
            {cell(c.fp, 'bad', t('evidence.confusion.fp'))}
            {cell(c.tn, 'good', t('evidence.confusion.tn'))}
          </tr>
        </tbody>
      </table>
      {summary.excluded > 0 ? <p className="mt-2 text-[11px] text-muted">{t('evidence.confusion.excluded', { count: summary.excluded })}</p> : null}
    </Card>
  );
}
