import { Leaf, Target } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BRANDS } from '@/adapters';
import { Card } from '@/components/ui/Card';
import { defaultRoiInputs, lifeExtensionFromChargeCooling } from '@/business/roi';
import type { CabinetAB } from '@/eval/cabinet';
import type { ABResult } from '@/eval/timeline';
import type { AsyncState } from '@/hooks/useAsync';
import { formatNumber } from '@/lib/format';
import { TARGET_ELECTRICITY_SAVING_PCT, TARGET_LIFE_EXTENSION_PCT } from '@/pages/roi/levers';
import { COMPETITOR_COLUMNS, COMPETITOR_ROWS, PLACEHOLDER_CELLS } from './competitors';

/** The one-sentence promise and the three things that make it different. */
/** Low end of the lead-time target of the brief, minutes. */
const LEAD_TARGET_MIN = 30;

export function UvpCard() {
  const { t } = useTranslation();
  return (
    <Card className="border-accent/40">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-accent">
        <Target aria-hidden className="size-4" />
        {t('market.uvp.label')}
      </p>
      <p className="mt-2 max-w-4xl text-xl font-semibold leading-snug tracking-tight">{t('market.uvp.statement')}</p>
      <ul className="mt-4 grid gap-3 md:grid-cols-3">
        {(['proactive', 'saas', 'agnostic'] as const).map((k) => (
          <li key={k} className="rounded-lg border border-border bg-surface-2 p-3">
            <p className="text-sm font-semibold">{t(`market.uvp.points.${k}.title`)}</p>
            <p className="mt-1 text-sm leading-snug text-muted">{t(`market.uvp.points.${k}.body`)}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function ProblemSolution() {
  const { t } = useTranslation();
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <h2 className="text-base font-semibold">{t('market.problem.title')}</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">{t('market.problem.intro')}</p>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed">
          {(['fire', 'aging', 'downtime'] as const).map((k) => (
            <li key={k}>{t(`market.problem.items.${k}`)}</li>
          ))}
        </ol>
      </Card>
      <Card>
        <h2 className="text-base font-semibold">{t('market.solution.title')}</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">{t('market.solution.intro')}</p>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          {(['cloud', 'twin', 'cross', 'assets'] as const).map((k) => (
            <li key={k}>{t(`market.solution.items.${k}`)}</li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

/** Targets of the brief next to what the PoC has measured, each with its status. */
export function TargetsCard({ ab, cabinet }: { ab: AsyncState<Record<'A' | 'B' | 'C', ABResult>>; cabinet: AsyncState<CabinetAB> }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'vi';
  const n = (x: number, dp = 1) => formatNumber(x, lang, dp);
  const inputs = defaultRoiInputs();

  const leadMin = ab.status === 'ready' ? BRANDS.map((b) => ab.data[b].leadTimeS).map((s) => (s === null ? null : s / 60)) : null;
  const leadText =
    leadMin === null
      ? t('market.targets.loading')
      : leadMin.every((x) => x !== null)
        ? t('market.targets.leadMeasured', { a: n(leadMin[0] as number), b: n(leadMin[1] as number), c: n(leadMin[2] as number) })
        : t('market.targets.none');
  const lifeText =
    cabinet.status !== 'ready'
      ? t('market.targets.loading')
      : t('market.targets.lifeMeasured', {
          pct: n(
            lifeExtensionFromChargeCooling(
              { tempC: inputs.rideTempC, chargeShare: inputs.chargeShare },
              cabinet.data.summaryWithout.meanTempC - cabinet.data.summaryWith.meanTempC,
            ),
          ),
        });

  const rows = [
    {
      id: 'lead',
      target: t('market.targets.leadTarget'),
      measured: leadText,
      // Below the 30-minute low end of the target means "not met": the screen says what the numbers say.
      status: leadMin !== null && leadMin.every((x) => x !== null && x >= LEAD_TARGET_MIN) ? 'met' : 'below',
    },
    { id: 'life', target: t('market.targets.lifeTarget', { pct: TARGET_LIFE_EXTENSION_PCT }), measured: lifeText, status: 'pilot' },
    { id: 'energy', target: t('market.targets.energyTarget', { pct: TARGET_ELECTRICITY_SAVING_PCT }), measured: t('market.targets.none'), status: 'pilot' },
  ] as const;

  return (
    <Card>
      <h2 className="text-base font-semibold">{t('market.targets.title')}</h2>
      <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted">{t('market.targets.intro')}</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted">
              <th scope="col" className="py-2 pr-3 font-medium">{t('market.targets.cols.what')}</th>
              <th scope="col" className="px-3 py-2 font-medium">{t('market.targets.cols.target')}</th>
              <th scope="col" className="px-3 py-2 font-medium">{t('market.targets.cols.measured')}</th>
              <th scope="col" className="py-2 pl-3 font-medium">{t('market.targets.cols.status')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border/60 align-top">
                <th scope="row" className="py-2 pr-3 text-left font-medium">{t(`market.targets.rows.${r.id}`)}</th>
                <td className="px-3 py-2">{r.target}</td>
                <td className="px-3 py-2">{r.measured}</td>
                <td className="py-2 pl-3 text-xs text-muted">{t(`market.targets.status.${r.status}`)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">{t('market.targets.note')}</p>
    </Card>
  );
}

/** TAM, SAM, SOM as definitions with placeholders: no market-size figure appears without a verified source. */
export function MarketSizing() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'vi';
  const inputs = defaultRoiInputs();
  const SOM_PACKS = 50_000;
  const arr = SOM_PACKS * inputs.saasFeeVndPerPackMonth * 12;

  const tiers = ['tam', 'sam', 'som'] as const;
  return (
    <Card>
      <h2 className="text-base font-semibold">{t('market.sizing.title')}</h2>
      <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted">{t('market.sizing.intro')}</p>
      <ul className="mt-4 grid gap-3 lg:grid-cols-3">
        {tiers.map((k) => (
          <li key={k} className="rounded-xl border border-border bg-surface-2 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-accent">{t(`market.sizing.${k}.label`)}</p>
            <p className="mt-1 text-sm font-semibold">{t(`market.sizing.${k}.name`)}</p>
            <p className="mt-1 text-sm leading-snug text-muted">{t(`market.sizing.${k}.def`)}</p>
            <p className="mt-3 rounded-md border border-dashed border-border px-2 py-1.5 text-sm font-medium" data-testid={`${k}-value`}>
              {k === 'som' ? t('market.sizing.som.target', { packs: formatNumber(SOM_PACKS, lang, 0) }) : t('market.sizing.placeholder')}
            </p>
            {k === 'som' ? <p className="mt-1 text-[11px] text-muted">{t('market.sizing.som.value')}</p> : null}
          </li>
        ))}
      </ul>

      <div className="mt-4 rounded-lg border border-border bg-surface-2 p-3">
        <h3 className="text-sm font-semibold">{t('market.arr.title')}</h3>
        <p className="mt-1 text-sm leading-relaxed">
          {t('market.arr.formula', {
            packs: formatNumber(SOM_PACKS, lang, 0),
            fee: formatNumber(inputs.saasFeeVndPerPackMonth, lang, 0),
            total: t('roi.units.billion', { value: formatNumber(arr / 1e9, lang, 2) }),
          })}
        </p>
        <p className="mt-1 text-xs leading-snug text-muted">{t('market.arr.caveat')}</p>
        <Link to="/roi" className="mt-1 inline-block text-xs font-medium text-accent underline">
          {t('market.arr.link')}
        </Link>
      </div>
    </Card>
  );
}

/** The comparison table: Voltify against the three kinds of competitor in the brief. */
export function CompetitorTable() {
  const { t } = useTranslation();
  return (
    <Card>
      <h2 className="text-base font-semibold">{t('market.competitors.title')}</h2>
      <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted">{t('market.competitors.intro')}</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[56rem] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs">
              <th scope="col" className="py-2 pr-3 font-medium text-muted">{t('market.competitors.criterion')}</th>
              {COMPETITOR_COLUMNS.map((c) => (
                <th key={c} scope="col" className={`px-3 py-2 align-bottom ${c === 'voltify' ? 'text-accent' : 'text-text'}`}>
                  <span className="block text-sm font-semibold">{t(`market.competitors.columns.${c}.name`)}</span>
                  <span className="block font-normal text-muted">{t(`market.competitors.columns.${c}.who`)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {COMPETITOR_ROWS.map((row) => (
              <tr key={row} className="border-b border-border/60 align-top">
                <th scope="row" className="py-2 pr-3 text-left text-xs font-medium text-muted">{t(`market.competitors.rows.${row}`)}</th>
                {COMPETITOR_COLUMNS.map((c) => {
                  const placeholder = PLACEHOLDER_CELLS.includes(`${c}.${row}`);
                  return (
                    <td key={c} className={`px-3 py-2 ${c === 'voltify' ? 'bg-accent/5 font-medium' : ''} ${placeholder ? 'text-muted' : ''}`}>
                      {placeholder ? t('market.competitors.placeholder') : t(`market.competitors.cells.${c}.${row}`)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs leading-snug text-muted">{t('market.competitors.note')}</p>
    </Card>
  );
}

export function AdvantageAndModel() {
  const { t } = useTranslation();
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <h2 className="text-base font-semibold">{t('market.advantage.title')}</h2>
        <ul className="mt-3 space-y-3 text-sm leading-relaxed">
          {(['engine', 'data'] as const).map((k) => (
            <li key={k}>
              <p className="font-semibold">{t(`market.advantage.items.${k}.title`)}</p>
              <p className="text-muted">{t(`market.advantage.items.${k}.body`)}</p>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs leading-snug text-muted">{t('market.advantage.caveat')}</p>
      </Card>
      <Card>
        <h2 className="text-base font-semibold">{t('market.revenue.title')}</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">{t('market.revenue.intro')}</p>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          {(['subscription', 'customers', 'noHardware'] as const).map((k) => (
            <li key={k}>{t(`market.revenue.items.${k}`)}</li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

export function RoadmapCard() {
  const { t } = useTranslation();
  const stages = ['poc', 'pilot', 'control', 'scale'] as const;
  return (
    <Card>
      <h2 className="text-base font-semibold">{t('market.roadmap.title')}</h2>
      <ol className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {stages.map((k, i) => (
          <li key={k} className="rounded-xl border border-border bg-surface-2 p-3">
            <p className="text-xs font-semibold text-accent">{t('market.roadmap.stage', { n: i })}</p>
            <p className="mt-1 text-sm font-semibold">{t(`market.roadmap.items.${k}.title`)}</p>
            <p className="mt-1 text-sm leading-snug text-muted">{t(`market.roadmap.items.${k}.body`)}</p>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs leading-snug text-muted">{t('market.roadmap.note')}</p>
    </Card>
  );
}

export function ImpactCard() {
  const { t } = useTranslation();
  return (
    <Card>
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <Leaf aria-hidden className="size-4 text-accent" />
        {t('market.impact.title')}
      </h2>
      <ul className="mt-3 grid gap-3 md:grid-cols-2">
        {(['trust', 'fire', 'waste', 'grid'] as const).map((k) => (
          <li key={k} className="rounded-lg border border-border bg-surface-2 p-3 text-sm leading-snug">
            <p className="font-semibold">{t(`market.impact.items.${k}.title`)}</p>
            <p className="mt-1 text-muted">{t(`market.impact.items.${k}.body`)}</p>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs leading-snug text-muted">{t('market.impact.caveat')}</p>
    </Card>
  );
}
