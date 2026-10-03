import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import type { RoiResult } from '@/business/roi';
import { CASES, type CaseId } from './levers';
import { TRACE_IDS, traceRows, type TraceId } from './trace';
import { useFormat } from './useFormat';

interface ResultsTableProps {
  results: Record<CaseId, RoiResult>;
  open: TraceId | null;
  onToggle: (id: TraceId) => void;
}

/** The outputs of the brief, careful and target side by side; each row opens the steps behind its figure. */
export function ResultsTable({ results, open, onToggle }: ResultsTableProps) {
  const { t } = useTranslation();
  const f = useFormat();

  const cell: Record<TraceId, (r: RoiResult) => { main: ReactNode; sub?: ReactNode; tone?: string }> = {
    replacement: (r) => ({ main: f.vnd(r.savings.replacementVnd), sub: t('roi.values.perYear') }),
    life: (r) => ({
      main: `+${f.pct(r.scenario.lifeExtensionPct, 1)}`,
      sub: t('roi.values.lifeFromTo', { from: f.num(r.baseline.daysToEol, 0), to: f.num(r.withVoltify.daysToEol, 0) }),
    }),
    energy: (r) => ({ main: f.vnd(r.savings.energyVnd), sub: t('roi.values.perYear') }),
    incidents: (r) => ({
      main: t('roi.values.incidents', { count: f.num(r.incidentsPrevented, 1) }),
      sub: t('roi.values.incidentsWorth', { value: f.vnd(r.savings.incidentsVnd) }),
    }),
    net: (r) => ({
      main: f.vnd(r.netPerYearVnd),
      sub: r.benefitPerFeeVnd === null ? t('roi.values.perYear') : t('roi.values.perFee', { ratio: f.num(r.benefitPerFeeVnd, r.benefitPerFeeVnd < 1 ? 2 : 1) }),
      tone: r.netPerYearVnd > 0 ? 'text-risk-safe' : 'text-risk-danger',
    }),
    payback: (r) => ({
      main: r.paybackMonths === null ? t('roi.values.noPayback') : t('roi.values.months', { months: f.num(r.paybackMonths, 1) }),
      sub: t('roi.values.onboarding', { value: f.vnd(r.onboardingVnd) }),
      tone: r.paybackMonths === null ? 'text-risk-danger' : undefined,
    }),
  };

  return (
    <Card>
      <h2 className="text-base font-semibold">{t('roi.results.title')}</h2>
      <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted">{t('roi.results.intro')}</p>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted">
              <th scope="col" className="py-2 pr-3 font-medium" />
              {CASES.map((c) => (
                <th key={c} scope="col" className="px-3 py-2 font-semibold text-text">
                  {t(`roi.cases.${c}.title`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TRACE_IDS.map((id) => (
              <tr key={id} className={`border-b border-border/60 align-top ${open === id ? 'bg-accent/5' : ''}`}>
                <th scope="row" className="py-3 pr-3 text-left">
                  <button
                    type="button"
                    aria-expanded={open === id}
                    onClick={() => onToggle(id)}
                    className="group flex w-full items-start gap-1.5 text-left"
                  >
                    <ChevronDown aria-hidden className={`mt-0.5 size-4 shrink-0 text-muted transition-transform ${open === id ? 'rotate-180 text-accent' : ''}`} />
                    <span>
                      <span className="block text-sm font-medium group-hover:text-accent">{t(`roi.outputs.${id}.label`)}</span>
                      <span className="mt-0.5 block text-[11px] font-normal leading-snug text-muted">{t(`roi.outputs.${id}.hint`)}</span>
                    </span>
                  </button>
                </th>
                {CASES.map((c) => {
                  const v = cell[id](results[c]);
                  return (
                    <td key={c} className="px-3 py-3">
                      <span className={`block text-base font-semibold tracking-tight ${v.tone ?? 'text-text'}`}>{v.main}</span>
                      {v.sub ? <span className="block text-[11px] text-muted">{v.sub}</span> : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-muted">{t('roi.results.clickHint')}</p>

      {open ? (
        <div className="mt-4 rounded-lg border border-accent/50 bg-surface-2 p-3" role="region" aria-label={t('roi.trace.title', { name: t(`roi.outputs.${open}.label`) })}>
          <h3 className="text-sm font-semibold">{t('roi.trace.title', { name: t(`roi.outputs.${open}.label`) })}</h3>
          <p className="mt-1 text-sm leading-relaxed">{t(`roi.trace.formulas.${open}`)}</p>
          <table className="mt-3 w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-border text-muted">
                <th scope="col" className="py-1 pr-3 text-left font-medium" />
                {CASES.map((c) => (
                  <th key={c} scope="col" className="px-3 py-1 text-left font-medium">
                    {t(`roi.cases.${c}.title`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {traceRows(open, results.careful, f).map((row, i) => (
                <tr key={row.step} className="border-b border-border/60">
                  <th scope="row" className="py-1.5 pr-3 text-left font-normal text-muted">
                    {t(`roi.trace.steps.${row.step}`)}
                  </th>
                  <td className="px-3 py-1.5 font-semibold">{row.value}</td>
                  <td className="px-3 py-1.5 font-semibold">{traceRows(open, results.target, f)[i].value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </Card>
  );
}
