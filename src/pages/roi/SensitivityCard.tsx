import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { EChart } from '@/components/charts/EChart';
import { useChartColors } from '@/components/charts/useChartColors';
import { Card } from '@/components/ui/Card';
import type { RoiInputs, RoiResult } from '@/business/roi';
import { buildSensitivityOption } from './sensitivity';
import { useFormat } from './useFormat';

interface SensitivityCardProps {
  inputs: RoiInputs;
  careful: RoiResult;
  target: RoiResult;
}

/** How much longer pack life has to be for the benefits to cover the fee, and what is gained beyond that. */
export function SensitivityCard({ inputs, careful, target }: SensitivityCardProps) {
  const { t } = useTranslation();
  const colors = useChartColors();
  const f = useFormat();
  const breakEven = careful.breakEvenLifeExtensionPct;
  const option = useMemo(
    () => buildSensitivityOption({ inputs, careful: careful.scenario, target: target.scenario, breakEvenPct: breakEven, colors, t }),
    [inputs, careful.scenario, target.scenario, breakEven, colors, t],
  );

  const verdict =
    breakEven === null
      ? t('roi.chart.impossible')
      : breakEven === 0
        ? t('roi.chart.noNeed')
        : t('roi.chart.verdict', { pct: f.num(breakEven, 1) });

  return (
    <Card>
      <h2 className="text-base font-semibold">{t('roi.chart.title')}</h2>
      <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted">{t('roi.chart.intro')}</p>
      <p className="mt-2 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-sm font-medium" role="status">
        {verdict}
      </p>
      <EChart option={option} height={300} label={t('roi.chart.title')} className="mt-2" />
    </Card>
  );
}
