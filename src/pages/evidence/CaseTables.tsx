import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import type { EvidenceSample, EvidenceSummary, GroupRow } from '@/eval/evidence';
import { formatNumber } from '@/lib/format';
import { TWIN_CASE_PARAM, caseOfSample, encodeTwinCase } from '@/pages/twin/caseParam';

export type GroupKey =
  | 'baseline'
  | 'heatwave43'
  | 'heavyClimb'
  | 'agedHigh'
  | 'cellImbalance'
  | 'severeHeatLoad'
  | 'short_severe'
  | 'short_moderate'
  | 'short_mild'
  | 'short_veryMild'
  | 'shortNeighbour';

/** `short.severe` -> `short_severe`: locale keys cannot contain the dot. */
export const groupKey = (group: string): GroupKey => group.replace('.', '_') as GroupKey;

const SHOWN = 8;

/** One row per kind of run: how many packs, how many events, how many alerts and, for shorts, how late. */
export function GroupsTable({ groups }: { groups: readonly GroupRow[] }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'vi';
  return (
    <Card>
      <h3 className="text-base font-semibold">{t('evidence.groups.title')}</h3>
      <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted">{t('evidence.groups.intro')}</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[44rem] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted">
              <th scope="col" className="py-2 pr-3 font-medium">{t('evidence.groups.cols.group')}</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">{t('evidence.groups.cols.packs')}</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">{t('evidence.groups.cols.events')}</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">{t('evidence.groups.cols.near')}</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">{t('evidence.groups.cols.alerted')}</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">{t('evidence.groups.cols.delay')}</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.group} className="border-b border-border/60 align-top">
                <th scope="row" className="py-2 pr-3 text-left font-medium">
                  {t(`evidence.groups.names.${groupKey(g.group)}`)}
                  <span className="block text-[11px] font-normal leading-snug text-muted">{t(`evidence.groups.descs.${groupKey(g.group)}`)}</span>
                </th>
                <td className="px-3 py-2 text-right">{g.packs}</td>
                <td className="px-3 py-2 text-right">{g.events}</td>
                <td className="px-3 py-2 text-right">{g.nearMisses}</td>
                <td className="px-3 py-2 text-right">
                  {g.alerted}
                  {g.events > 0 ? <span className="block text-[11px] text-muted">{t('evidence.groups.ofEvents', { alerted: g.eventsAlerted, events: g.events })}</span> : null}
                </td>
                <td className="px-3 py-2 text-right">
                  {g.medianDelayS === null ? '—' : t('evidence.headline.minutes', { value: formatNumber(g.medianDelayS / 60, lang, 1) })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

interface CaseListProps {
  title: string;
  intro: string;
  empty: string;
  samples: readonly EvidenceSample[];
}

/** The cases the AI got wrong, each with the reason it is a known kind of error and a link to replay it. */
export function CaseList({ title, intro, empty, samples }: CaseListProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'vi';
  const [all, setAll] = useState(false);
  const shown = all ? samples : samples.slice(0, SHOWN);

  // How many of each kind, so a long list of the same error reads as one finding.
  const counts = new Map<string, number>();
  for (const s of samples) counts.set(s.group, (counts.get(s.group) ?? 0) + 1);

  return (
    <Card>
      <h3 className="text-base font-semibold">
        {title} <span className="font-normal text-muted">({samples.length})</span>
      </h3>
      <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted">{intro}</p>
      {samples.length === 0 ? (
        <p className="mt-3 text-sm" role="status">
          {empty}
        </p>
      ) : (
        <>
          <ul className="mt-3 space-y-1 text-sm">
            {[...counts].map(([g, n]) => (
              <li key={g}>
                <span className="font-semibold">{n}×</span> {t(`evidence.groups.names.${groupKey(g)}`)}: <span className="text-muted">{t(`evidence.reasons.${groupKey(g)}`)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[40rem] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-border text-muted">
                  <th scope="col" className="py-1.5 pr-3 font-medium">{t('evidence.cases.cols.group')}</th>
                  <th scope="col" className="px-3 py-1.5 font-medium">{t('evidence.cases.cols.pack')}</th>
                  <th scope="col" className="px-3 py-1.5 font-medium">{t('evidence.cases.cols.seed')}</th>
                  <th scope="col" className="px-3 py-1.5 text-right font-medium">{t('evidence.cases.cols.score')}</th>
                  <th scope="col" className="px-3 py-1.5 text-right font-medium">{t('evidence.cases.cols.temp')}</th>
                  <th scope="col" className="py-1.5 pl-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {shown.map((s, i) => (
                  <tr key={`${s.suiteId}-${s.batteryId}-${i}`} className="border-b border-border/60">
                    <th scope="row" className="py-1.5 pr-3 text-left font-normal">{t(`evidence.groups.names.${groupKey(s.group)}`)}</th>
                    <td className="px-3 py-1.5">#{s.batteryId}</td>
                    <td className="px-3 py-1.5">{s.seed}</td>
                    <td className="px-3 py-1.5 text-right">{formatNumber(s.maxScore, lang, 0)}</td>
                    <td className="px-3 py-1.5 text-right">{formatNumber(s.maxTempC, lang, 1)} °C</td>
                    <td className="py-1.5 pl-3">
                      <Link
                        to={`/twin?${TWIN_CASE_PARAM}=${encodeTwinCase(caseOfSample(s))}`}
                        className="font-medium text-accent underline"
                      >
                        {t('evidence.cases.open')}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {samples.length > SHOWN ? (
            <button type="button" onClick={() => setAll(!all)} className="mt-2 text-xs font-medium text-accent underline">
              {all ? t('evidence.cases.fewer') : t('evidence.cases.all', { count: samples.length })}
            </button>
          ) : null}
        </>
      )}
    </Card>
  );
}

/** Convenience for the page: the two lists from one summary. */
export function CaseLists({ summary }: { summary: EvidenceSummary }) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <CaseList title={t('evidence.cases.missTitle')} intro={t('evidence.cases.missIntro')} empty={t('evidence.cases.missEmpty')} samples={summary.misses} />
      <CaseList title={t('evidence.cases.falseTitle')} intro={t('evidence.cases.falseIntro')} empty={t('evidence.cases.falseEmpty')} samples={summary.falseAlarms} />
    </div>
  );
}
