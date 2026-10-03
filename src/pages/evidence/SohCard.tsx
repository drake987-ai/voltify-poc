import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { EChart } from '@/components/charts/EChart';
import { useChartColors } from '@/components/charts/useChartColors';
import { Card } from '@/components/ui/Card';
import type { EvidenceSummary } from '@/eval/evidence';
import { formatNumber } from '@/lib/format';
import { sohOption } from './charts';
import { RealSohCard } from './RealSohCard';

/** Module 4 (impedance / SOH) against the simulator's truth, plus the honest note that no real data is loaded yet. */
export function SohCard({ summary }: { summary: EvidenceSummary }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'vi';
  const colors = useChartColors();
  const option = useMemo(() => sohOption(summary, colors, t), [summary, colors, t]);
  return (
    <Card>
      <h3 className="text-base font-semibold">{t('evidence.soh.title')}</h3>
      <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted">{t('evidence.soh.intro')}</p>
      <div className="mt-3 grid gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,4fr)]">
        <div className="min-w-0">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted">
                <th scope="col" className="py-2 pr-3 font-medium" />
                <th scope="col" className="px-3 py-2 text-right font-medium">{t('evidence.soh.cols.n')}</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">{t('evidence.soh.cols.mae')}</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">{t('evidence.soh.cols.bias')}</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">{t('evidence.soh.cols.classes')}</th>
              </tr>
            </thead>
            <tbody>
              {summary.soh.rows.map((r) => (
                <tr key={r.brand} className="border-b border-border/60">
                  <th scope="row" className="py-2 pr-3 text-left font-medium">{t(`brands.${r.brand}`)}</th>
                  <td className="px-3 py-2 text-right">{r.n}</td>
                  <td className="px-3 py-2 text-right">{formatNumber(r.maePp, lang, 2)}</td>
                  <td className="px-3 py-2 text-right">{formatNumber(r.biasPp, lang, 2)}</td>
                  <td className="px-3 py-2 text-right">{formatNumber(r.classAccuracy * 100, lang, 0)} %</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] leading-snug text-muted">{t('evidence.soh.note')}</p>
        </div>
        <EChart option={option} height={340} label={t('evidence.soh.title')} className="min-w-0" />
      </div>
      <RealSohCard />
    </Card>
  );
}
