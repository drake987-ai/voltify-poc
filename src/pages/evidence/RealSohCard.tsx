import { ExternalLink } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EChart } from '@/components/charts/EChart';
import { useChartColors } from '@/components/charts/useChartColors';
import { DataBadge } from '@/components/ui/DataBadge';
import { Select } from '@/components/ui/Select';
import { PCOE_CELLS, PCOE_SOURCE, type PcoeCell } from '@/data/nasaPcoe';
import { analyseRealSoh } from '@/eval/realSoh';
import { formatNumber } from '@/lib/format';
import { realSohOption } from './realChart';

/**
 * The SOH module's resistance-to-SOH law on real cells (NASA PCoE). The result is shown as it came out:
 * the simulator's ageing constant does not hold on these cells.
 */
export function RealSohCard() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'vi';
  const colors = useChartColors();
  const result = useMemo(() => analyseRealSoh(), []);
  const [cell, setCell] = useState<PcoeCell>('B0005');
  const option = useMemo(() => realSohOption(result, cell, colors, t), [result, cell, colors, t]);
  const n = (x: number, dp = 1) => formatNumber(x, lang, dp);

  const gammas = result.cells.map((c) => c.gammaOwn);
  const moduleMae = result.cells.map((c) => c.maeModulePp);
  const othersMae = result.cells.map((c) => c.maeOthersPp);

  return (
    <div className="mt-4 rounded-lg border border-accent/40 bg-surface-2 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h4 className="text-sm font-semibold">{t('evidence.real.title')}</h4>
        <DataBadge source={{ kind: 'real', dataset: 'NASA PCoE' }} />
      </div>
      <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted">{t('evidence.real.intro')}</p>

      <div className="mt-3 grid gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,4fr)]">
        <div className="min-w-0">
          <div className="max-w-[16rem]">
            <Select label={t('evidence.real.cell')} value={cell} onChange={setCell} options={PCOE_CELLS.map((c) => ({ value: c, label: c }))} />
          </div>
          <EChart option={option} height={320} label={t('evidence.real.chartAria', { cell })} className="mt-2" />
        </div>

        <div className="min-w-0 overflow-x-auto">
          <table className="w-full min-w-[28rem] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-border text-muted">
                <th scope="col" className="py-1.5 pr-2 font-medium">{t('evidence.real.cols.cell')}</th>
                <th scope="col" className="px-2 py-1.5 text-right font-medium">{t('evidence.real.cols.fade')}</th>
                <th scope="col" className="px-2 py-1.5 text-right font-medium">{t('evidence.real.cols.ratio')}</th>
                <th scope="col" className="px-2 py-1.5 text-right font-medium">{t('evidence.real.cols.gamma')}</th>
                <th scope="col" className="px-2 py-1.5 text-right font-medium">{t('evidence.real.cols.module')}</th>
                <th scope="col" className="px-2 py-1.5 text-right font-medium">{t('evidence.real.cols.others')}</th>
                <th scope="col" className="py-1.5 pl-2 text-right font-medium">{t('evidence.real.cols.baseline')}</th>
              </tr>
            </thead>
            <tbody>
              {result.cells.map((c) => (
                <tr key={c.cell} className="border-b border-border/60">
                  <th scope="row" className="py-1.5 pr-2 text-left font-medium">
                    {c.cell}
                    <span className="block text-[10px] font-normal text-muted">{t('evidence.real.counts', { d: c.discharges, i: c.impedanceCount })}</span>
                  </th>
                  <td className="px-2 py-1.5 text-right">{n(c.fadePct)} %</td>
                  <td className="px-2 py-1.5 text-right">×{n(c.ratioEnd, 2)}</td>
                  <td className="px-2 py-1.5 text-right">{n(c.gammaOwn, 2)}</td>
                  <td className="px-2 py-1.5 text-right font-semibold">{n(c.maeModulePp)}</td>
                  <td className="px-2 py-1.5 text-right font-semibold">{n(c.maeOthersPp)}</td>
                  <td className="py-1.5 pl-2 text-right text-muted">{n(c.maeBaselinePp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] leading-snug text-muted">{t('evidence.real.colsNote', { gamma: n(result.moduleGamma, 0) })}</p>
        </div>
      </div>

      <div className="mt-3 rounded-md border border-risk-warning/50 bg-risk-warning/10 p-3 text-sm leading-relaxed" role="note">
        <p className="font-semibold">{t('evidence.real.findingTitle')}</p>
        <p className="mt-1">
          {t('evidence.real.finding', {
            gamma: n(result.moduleGamma, 0),
            gMin: n(Math.min(...gammas), 1),
            gMax: n(Math.max(...gammas), 1),
            mMin: n(Math.min(...moduleMae), 0),
            mMax: n(Math.max(...moduleMae), 0),
            oMin: n(Math.min(...othersMae), 0),
            oMax: n(Math.max(...othersMae), 0),
          })}
        </p>
        <p className="mt-1 text-muted">{t('evidence.real.consequence')}</p>
      </div>

      <p className="mt-3 text-[11px] leading-snug text-muted">{t('evidence.real.scope')}</p>
      <p className="mt-1 text-[11px] leading-snug text-muted">
        {t('evidence.real.source')} {PCOE_SOURCE.citation}.{' '}
        <a href={PCOE_SOURCE.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-accent underline">
          {t('evidence.real.link')}
          <ExternalLink aria-hidden className="size-3" />
        </a>
      </p>
    </div>
  );
}
