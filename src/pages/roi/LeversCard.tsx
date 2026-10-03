import { RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import type { RoiInputs } from '@/business/roi';
import { CASES, LEVERS, leverValue, type CaseId, type LeverId, type LeverSource, type Measured, type Overrides } from './levers';
import { NumberField } from './NumberField';
import { useFormat } from './useFormat';

const RANGE: Record<LeverId, { min: number; max: number; step: number }> = {
  lifeExtensionPct: { min: 0, max: 200, step: 1 },
  electricitySavingPct: { min: 0, max: 100, step: 1 },
  preventionPct: { min: 0, max: 100, step: 5 },
};

const SOURCE_STYLE: Record<LeverSource, string> = {
  measured: 'border-risk-safe/50 bg-risk-safe/10 text-risk-safe',
  target: 'border-risk-watch/50 bg-risk-watch/10 text-risk-watch',
  unmeasured: 'border-border bg-surface text-muted',
  pending: 'border-border bg-surface text-muted',
  override: 'border-accent/50 bg-accent/10 text-accent',
};

interface LeversCardProps {
  inputs: RoiInputs;
  measured: Measured;
  overrides: Overrides;
  onChange: (next: Overrides) => void;
}

function Cell({ c, lever, inputs, measured, overrides, onChange }: LeversCardProps & { c: CaseId; lever: LeverId }) {
  const { t } = useTranslation();
  const f = useFormat();
  const key = `${c}.${lever}` as const;
  const v = leverValue(c, lever, inputs, measured, overrides);
  const { min, max, step } = RANGE[lever];

  return (
    <td className="px-3 py-3 align-top">
      <div className="flex items-center gap-2">
        <div className="w-28">
          <NumberField
            hideLabel
            label={`${t(`roi.levers.rows.${lever}`)}, ${t(`roi.cases.${c}.title`)}`}
            // Shown with at most one decimal; typing sets an override, which the reset button removes.
            value={Number(v.value.toFixed(1))}
            onChange={(n) => onChange({ ...overrides, [key]: Math.min(max, Math.max(min, n)) })}
            min={min}
            max={max}
            step={step}
            suffix="%"
          />
        </div>
        {v.source === 'override' ? (
          <button
            type="button"
            title={t('roi.levers.resetOne')}
            aria-label={t('roi.levers.resetOne')}
            onClick={() => {
              const next = { ...overrides };
              delete next[key];
              onChange(next);
            }}
            className="rounded-md p-1 text-muted hover:text-accent"
          >
            <RotateCcw aria-hidden className="size-3.5" />
          </button>
        ) : null}
      </div>
      <span className={`mt-1.5 inline-block rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${SOURCE_STYLE[v.source]}`}>
        {t(`roi.levers.sources.${v.source}`)}
      </span>
      {v.source === 'measured' && lever === 'lifeExtensionPct' ? (
        <p className="mt-1 text-[11px] text-muted">{t('roi.levers.derived', { drop: f.num(measured.chargeTempDropC ?? 0, 1) })}</p>
      ) : null}
    </td>
  );
}

/** The levers that differ between the careful and the target case: each cell shows its value and where it comes from. */
export function LeversCard(props: LeversCardProps) {
  const { t } = useTranslation();
  return (
    <Card>
      <h2 className="text-base font-semibold">{t('roi.levers.title')}</h2>
      <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted">{t('roi.levers.intro')}</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted">
              <th scope="col" className="py-2 pr-3 font-medium" />
              {CASES.map((c) => (
                <th key={c} scope="col" className="px-3 py-2 font-medium">
                  <span className="block text-sm font-semibold text-text">{t(`roi.cases.${c}.title`)}</span>
                  {t(`roi.cases.${c}.desc`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {LEVERS.map((lever) => (
              <tr key={lever} className="border-b border-border/60">
                <th scope="row" className="py-3 pr-3 text-left align-top text-sm font-medium">
                  {t(`roi.levers.rows.${lever}`)}
                  <span className="mt-0.5 block text-[11px] font-normal leading-snug text-muted">{t(`roi.levers.why.${lever}`)}</span>
                </th>
                {CASES.map((c) => (
                  <Cell key={c} c={c} lever={lever} {...props} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
