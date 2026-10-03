import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { LevelGlyph } from '@/components/ui/LevelGlyph';
import { ASSUMPTION_IDS, DEFAULT_ASSUMPTIONS, incidentSavings } from '@/business/assumptions';
import type { FleetKpis } from '@/fleet';
import { formatNumber } from '@/lib/format';
import { RISK_LEVELS } from '@/lib/riskLevels';

export const KPI_IDS = ['levels', 'meanSoh', 'alerts', 'swaps', 'prevented', 'savings'] as const;
export type KpiId = (typeof KPI_IDS)[number];

const tile = 'min-w-0 rounded-xl border border-border bg-surface p-3 text-left transition-colors hover:border-accent focus-visible:ring-2';

interface KpiRowProps {
  kpis: FleetKpis | null;
  total: number;
  open: KpiId | null;
  onToggle: (id: KpiId) => void;
}

/** Fleet KPIs. Every figure is a button: clicking it shows how it is computed and what it assumes. */
export function KpiRow({ kpis, total, open, onToggle }: KpiRowProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'vi';
  const dash = '—';
  const k = kpis;
  const millions = k ? t('fleet.units.millionVnd', { value: formatNumber(k.savingsVnd / 1e6, lang, 1) }) : dash;

  const items: { id: Exclude<KpiId, 'levels'>; label: string; value: string }[] = [
    { id: 'meanSoh', label: t('fleet.kpi.meanSoh'), value: k && Number.isFinite(k.meanSoh) ? `${formatNumber(k.meanSoh, lang, 1)} %` : dash },
    { id: 'alerts', label: t('fleet.kpi.alerts'), value: k ? String(k.alertsTotal) : dash },
    { id: 'swaps', label: t('fleet.kpi.swaps'), value: k ? String(k.swaps) : dash },
    { id: 'prevented', label: t('fleet.kpi.prevented'), value: k ? String(k.prevented) : dash },
    { id: 'savings', label: t('fleet.kpi.savings'), value: millions },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {RISK_LEVELS.map((level, i) => (
          <button
            key={level}
            type="button"
            aria-expanded={open === 'levels'}
            onClick={() => onToggle('levels')}
            className={`${tile} ${open === 'levels' ? 'border-accent' : ''}`}
          >
            <p className="flex items-center gap-2 text-xs font-medium text-muted">
              <LevelGlyph level={i as 0 | 1 | 2 | 3} />
              {t(`risk.${level}`)}
            </p>
            <p className="mt-1 text-2xl font-semibold tracking-tight">{k ? k.levelCounts[i] : dash}</p>
            <p className="text-xs text-muted">{t('fleet.kpi.ofTotal', { total })}</p>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {items.map((it) => (
          <button
            key={it.id}
            type="button"
            aria-expanded={open === it.id}
            onClick={() => onToggle(it.id)}
            className={`${tile} ${open === it.id ? 'border-accent' : ''}`}
          >
            <p className="text-xs font-medium text-muted">{it.label}</p>
            <p className="mt-1 truncate text-xl font-semibold tracking-tight text-accent">{it.value}</p>
            <p className="text-xs text-muted">{t('fleet.kpi.clickHint')}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

/** The formula, inputs and assumptions behind the KPI that was clicked. */
export function KpiTrace({ id, kpis, onClose }: { id: KpiId; kpis: FleetKpis; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'vi';
  const vnd = (x: number) => t('fleet.units.vnd', { value: Math.round(x).toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US') });
  const a = DEFAULT_ASSUMPTIONS;
  const s = incidentSavings(kpis.prevented);

  let lines: { label: string; value: string }[] = [];
  switch (id) {
    case 'levels':
      lines = RISK_LEVELS.map((l, i) => ({ label: t(`risk.${l}`), value: String(kpis.levelCounts[i]) }));
      break;
    case 'meanSoh':
      lines = [{ label: t('fleet.kpi.meanSoh'), value: Number.isFinite(kpis.meanSoh) ? `${formatNumber(kpis.meanSoh, lang, 1)} %` : '—' }];
      break;
    case 'alerts':
      lines = [{ label: t('fleet.kpi.alerts'), value: String(kpis.alertsTotal) }];
      break;
    case 'swaps':
      lines = [{ label: t('fleet.kpi.swaps'), value: String(kpis.swaps) }];
      break;
    case 'prevented':
      lines = [
        { label: t('fleet.trace.tripsBaseline'), value: String(kpis.bmsTripsBaseline) },
        { label: t('fleet.trace.tripsVoltify'), value: String(kpis.bmsTripsVoltify) },
        { label: t('fleet.kpi.prevented'), value: String(kpis.prevented) },
      ];
      break;
    case 'savings':
      lines = [
        { label: t('fleet.kpi.prevented'), value: String(s.prevented) },
        { label: t('fleet.trace.packLoss', { count: s.prevented }), value: vnd(s.packLossAvoidedVnd) },
        { label: t('fleet.trace.stranded', { count: s.prevented }), value: vnd(s.strandedAvoidedVnd) },
        { label: t('fleet.kpi.savings'), value: vnd(s.totalVnd) },
      ];
      break;
  }

  return (
    <Card className="border-accent/50">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-base font-semibold">{t('fleet.trace.title', { name: t(`fleet.trace.names.${id}`) })}</h2>
        <button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-sm text-muted hover:text-text">
          {t('fleet.trace.close')}
        </button>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-text">{t(`fleet.trace.formulas.${id}`)}</p>

      <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        {lines.map((l) => (
          <div key={l.label} className="flex justify-between gap-3 border-b border-border/60 py-1">
            <dt className="text-muted">{l.label}</dt>
            <dd className="font-semibold">{l.value}</dd>
          </div>
        ))}
      </dl>

      {id === 'savings' ? (
        <div className="mt-4">
          <h3 className="text-sm font-semibold">{t('fleet.trace.assumptions')}</h3>
          <ul className="mt-2 space-y-2 text-sm">
            {ASSUMPTION_IDS.filter((x) => ['packCostVnd', 'packDamageFraction', 'strandedCostVnd'].includes(x)).map((aid) => (
              <li key={aid} className="rounded-lg border border-border bg-surface-2 p-2">
                <p className="flex justify-between gap-3 font-medium">
                  <span>{t(`assumptions.${aid}.label`)}</span>
                  <span>
                    {a[aid].unit === 'VND'
                      ? vnd(a[aid].value)
                      : formatNumber(a[aid].value, lang, 2)}
                  </span>
                </p>
                <p className="mt-0.5 text-xs text-muted">{t(`assumptions.${aid}.why`)}</p>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">{t('fleet.trace.placeholder')}</p>
        </div>
      ) : null}
      {id === 'prevented' ? <p className="mt-3 text-xs text-muted">{t('fleet.trace.counterfactual')}</p> : null}
    </Card>
  );
}
