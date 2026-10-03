import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EChart } from '@/components/charts/EChart';
import { useChartColors } from '@/components/charts/useChartColors';
import { Card } from '@/components/ui/Card';
import { ReferencesCard } from '@/components/ui/ReferencesCard';
import { Select } from '@/components/ui/Select';
import { formatNumber } from '@/lib/format';
import { DEFAULT_OPTIONS, NEAR_MISS_C, SHORT_FAULTS, aggregate, type EvidenceOptions, type SuiteResult } from '@/eval/evidence';
import { CaseLists, GroupsTable } from './CaseTables';
import { leadOption, rocOption } from './charts';
import { ConfusionMatrix, Headline } from './Headline';
import { SohCard } from './SohCard';

const NEAR_MISS_OPTIONS = ['exclude', 'event', 'normal'] as const;
const MAINTENANCE_OPTIONS = ['normal', 'exclude'] as const;

/** The evaluation of one finished batch, recomputed from the samples whenever the counting rules change. */
export function EvidenceView({ results }: { results: readonly SuiteResult[] }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'vi';
  const colors = useChartColors();
  const [options, setOptions] = useState<EvidenceOptions>(DEFAULT_OPTIONS);
  const summary = useMemo(() => aggregate(results, options), [results, options]);
  const roc = useMemo(() => rocOption(summary, colors, t), [summary, colors, t]);
  const lead = useMemo(() => leadOption(summary.leadTime.values, colors, t), [summary.leadTime.values, colors, t]);

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="text-base font-semibold">{t('evidence.rules.title')}</h2>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted">{t('evidence.rules.intro', { temp: NEAR_MISS_C })}</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div>
            <Select
              label={t('evidence.rules.nearMiss')}
              value={options.nearMiss}
              onChange={(nearMiss) => setOptions({ ...options, nearMiss })}
              options={NEAR_MISS_OPTIONS.map((o) => ({ value: o, label: t(`evidence.rules.nearMissOptions.${o}`) }))}
            />
            <p className="mt-1 text-[11px] leading-snug text-muted">{t('evidence.rules.nearMissHint', { temp: NEAR_MISS_C })}</p>
          </div>
          <div>
            <Select
              label={t('evidence.rules.maintenance')}
              value={options.maintenance}
              onChange={(maintenance) => setOptions({ ...options, maintenance })}
              options={MAINTENANCE_OPTIONS.map((o) => ({ value: o, label: t(`evidence.rules.maintenanceOptions.${o}`) }))}
            />
            <p className="mt-1 text-[11px] leading-snug text-muted">{t('evidence.rules.maintenanceHint')}</p>
          </div>
        </div>
      </Card>

      <Headline summary={summary} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,4fr)_minmax(0,4fr)]">
        <ConfusionMatrix summary={summary} />
        <Card className="min-w-0">
          <h3 className="text-base font-semibold">{t('evidence.roc.title')}</h3>
          <p className="mt-1 text-xs leading-snug text-muted">{t('evidence.roc.intro')}</p>
          <EChart option={roc} height={300} label={t('evidence.roc.title')} className="mt-2" />
        </Card>
        <Card className="min-w-0">
          <h3 className="text-base font-semibold">{t('evidence.lead.title')}</h3>
          <p className="mt-1 text-xs leading-snug text-muted">{t('evidence.lead.intro')}</p>
          <EChart option={lead} height={300} label={t('evidence.lead.title')} className="mt-2" />
          {summary.lateAlerts > 0 ? <p className="mt-1 text-xs text-risk-warning">{t('evidence.lead.late', { count: summary.lateAlerts })}</p> : null}
        </Card>
      </div>

      <GroupsTable groups={summary.groups} />
      <CaseLists summary={summary} />
      <SohCard summary={summary} />

      <Card className="border-accent/40">
        <h2 className="text-base font-semibold">{t('evidence.limits.title')}</h2>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted">
          {(['simulated', 'event', 'lead', 'short', 'weakCell', 'slow', 'soh', 'prevalence'] as const).map((k) => (
            <li key={k}>{t(`evidence.limits.items.${k}`, { temp: NEAR_MISS_C, ohm: formatNumber(SHORT_FAULTS.veryMild.rShortMinOhm, lang, 1) })}</li>
          ))}
        </ul>
        <h3 className="mt-4 text-sm font-semibold">{t('evidence.roadmap.title')}</h3>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-muted">
          {(['one', 'two', 'three'] as const).map((k) => (
            <li key={k}>{t(`evidence.roadmap.${k}`)}</li>
          ))}
        </ol>
      </Card>

      <ReferencesCard />
    </div>
  );
}
