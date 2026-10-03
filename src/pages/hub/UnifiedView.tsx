import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { BRANDS, type Brand } from '@/adapters';
import { explainAssessment } from '@/ai';
import { EChart } from '@/components/charts/EChart';
import { useChartColors } from '@/components/charts/useChartColors';
import { Card } from '@/components/ui/Card';
import { RiskBadge } from '@/components/ui/RiskBadge';
import type { HubFrame, HubRun } from '@/eval/hub';
import { formatNumber } from '@/lib/format';
import { formatClock } from '@/lib/timelineSeries';
import { buildHubOption } from './hubChart';

interface UnifiedViewProps {
  run: HubRun;
  frames: Record<Brand, HubFrame | null>;
  tS: number;
}

/** The three brands on one screen: the same rows, the same units, one Risk Score scale. */
export function UnifiedView({ run, frames, tS }: UnifiedViewProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'vi';
  const colors = useChartColors();
  const n = (x: number, dp = 1) => formatNumber(x, lang, dp);
  const option = useMemo(() => buildHubOption({ run, tS, colors, t }), [run, tS, colors, t]);
  const dash = '—';

  const rows: { id: 'batteryId' | 'interval' | 'soc' | 'coreTemp' | 'current' | 'packV' | 'spread' | 'score' | 'signal' | 'alert'; cell: (b: Brand, f: HubFrame) => React.ReactNode }[] = [
    { id: 'batteryId', cell: (_b, f) => `#${f.telemetry.batteryId}` },
    { id: 'interval', cell: (b) => t('hub.unified.seconds', { seconds: run.streams[b].intervalS }) },
    { id: 'soc', cell: (_b, f) => `${n(f.telemetry.soc * 100)} %` },
    { id: 'coreTemp', cell: (_b, f) => `${n(f.telemetry.coreTemp)} °C` },
    { id: 'current', cell: (_b, f) => `${n(f.telemetry.current)} A` },
    { id: 'packV', cell: (_b, f) => `${n(f.telemetry.cellVoltages.reduce((s, v) => s + v, 0))} V` },
    {
      id: 'spread',
      cell: (_b, f) => `${n((Math.max(...f.telemetry.cellVoltages) - Math.min(...f.telemetry.cellVoltages)) * 1000, 0)} mV`,
    },
    {
      id: 'score',
      cell: (_b, f) => (
        <span className="flex flex-wrap items-center gap-2">
          <b>{n(f.assessment.risk.score, 0)}</b>
          <RiskBadge level={f.assessment.risk.level} />
        </span>
      ),
    },
    {
      id: 'signal',
      cell: (_b, f) => {
        const top = explainAssessment(f.assessment)[0];
        return top ? t(`twin.signals.${top.signal}.name`) : t('twin.risk.empty');
      },
    },
    {
      id: 'alert',
      cell: (b) => {
        const at = run.streams[b].alertS;
        return at !== null && at <= tS ? formatClock(at) : dash;
      },
    },
  ];

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,4fr)]">
      <Card className="min-w-0">
        <h2 className="text-base font-semibold">{t('hub.unified.title')}</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">{t('hub.unified.intro')}</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[30rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted">
                <th scope="col" className="py-2 pr-3 font-medium" />
                {BRANDS.map((b) => (
                  <th key={b} scope="col" className="px-3 py-2 font-medium">
                    {t(`brands.${b}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/60 align-top">
                  <th scope="row" className="py-2 pr-3 text-left text-xs font-medium text-muted">
                    {t(`hub.unified.rows.${r.id}`)}
                  </th>
                  {BRANDS.map((b) => {
                    const f = frames[b];
                    return (
                      <td key={b} className="px-3 py-2">
                        {f ? r.cell(b, f) : dash}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="min-w-0">
        <h2 className="text-base font-semibold">{t('hub.unified.chartTitle')}</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">{t('hub.unified.chartIntro')}</p>
        <EChart option={option} height={330} label={t('hub.unified.chartTitle')} className="mt-2" />
      </Card>
    </div>
  );
}
