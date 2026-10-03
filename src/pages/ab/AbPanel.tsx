import { CircleCheck, Eye, OctagonX, PackageCheck, ShieldAlert, TriangleAlert } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { EChart } from '@/components/charts/EChart';
import { useChartColors } from '@/components/charts/useChartColors';
import { RiskBadge } from '@/components/ui/RiskBadge';
import type { Timeline } from '@/eval/timeline';
import { formatNumber } from '@/lib/format';
import { frameAt } from '@/lib/timelineSeries';
import { buildAbOption, type AbSide } from './abChart';

interface AbPanelProps {
  timeline: Timeline;
  side: AbSide;
  tS: number;
  durationS: number;
}

function Chip({ icon, tone, children }: { icon: ReactNode; tone: 'ok' | 'warn' | 'bad'; children: ReactNode }) {
  const cls =
    tone === 'bad'
      ? 'border-risk-danger/50 bg-risk-danger/10 text-risk-danger'
      : tone === 'warn'
        ? 'border-risk-warning/50 bg-risk-warning/10 text-risk-warning'
        : 'border-risk-safe/50 bg-risk-safe/10 text-risk-safe';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${cls}`}>
      {icon}
      {children}
    </span>
  );
}

export function AbPanel({ timeline, side, tS, durationS }: AbPanelProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'vi';
  const colors = useChartColors();
  const option = useMemo(
    () => buildAbOption({ timeline, side, tS, durationS, colors, t }),
    [timeline, side, tS, durationS, colors, t],
  );

  const frame = frameAt(timeline.frames, tS);
  const sum = timeline.summary;
  const tripped = sum.bmsTripS !== null && sum.bmsTripS <= tS;
  const swapped = sum.swapS !== null && sum.swapS <= tS;
  const derating = sum.derateS !== null && sum.derateS <= tS;
  const alerted = sum.alertS !== null && sum.alertS <= tS;
  const eta = frame?.assessment?.thermal.etaToLimitS ?? null;
  const percent = Math.round((frame?.truth.derate ?? 0) * 100);

  let status: ReactNode;
  if (side === 'bms') {
    status = tripped ? (
      <Chip tone="bad" icon={<OctagonX aria-hidden className="size-3.5" />}>
        {t('ab.status.stranded')}
      </Chip>
    ) : (
      <Chip tone="ok" icon={<CircleCheck aria-hidden className="size-3.5" />}>
        {t('ab.status.running')}
      </Chip>
    );
  } else if (tripped && !swapped) {
    status = (
      <Chip tone="bad" icon={<OctagonX aria-hidden className="size-3.5" />}>
        {t('ab.status.tripped')}
      </Chip>
    );
  } else if (swapped) {
    status = (
      <Chip tone="ok" icon={<PackageCheck aria-hidden className="size-3.5" />}>
        {t('ab.status.swapped')}
      </Chip>
    );
  } else if (derating) {
    status = (
      <Chip tone="warn" icon={<TriangleAlert aria-hidden className="size-3.5" />}>
        {t('ab.status.derating', { percent })}
      </Chip>
    );
  } else if (alerted) {
    status = (
      <Chip tone="warn" icon={<ShieldAlert aria-hidden className="size-3.5" />}>
        {t('ab.marks.ai_alert')}
      </Chip>
    );
  } else {
    status = (
      <Chip tone="ok" icon={<Eye aria-hidden className="size-3.5" />}>
        {t('ab.status.watching')}
      </Chip>
    );
  }

  const title = t(`ab.panels.${side}.title`);
  return (
    <section
      aria-label={title}
      className={`min-w-0 rounded-xl border bg-surface p-4 ${side === 'voltify' ? 'border-accent/40' : 'border-border'}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <p className="text-sm text-muted">{t(`ab.panels.${side}.subtitle`)}</p>
        </div>
        {status}
      </header>

      <div className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-2">
        <div>
          <p className="text-xs font-medium text-muted">{t('twin.readout.coreTemp')}</p>
          <p className="text-3xl font-semibold tracking-tight">
            {frame ? formatNumber(frame.telemetry.coreTemp, lang, 1) : '—'}
            <span className="ml-1 text-base font-medium text-muted">°C</span>
          </p>
        </div>
        {side === 'voltify' && frame?.assessment ? (
          <>
            <div>
              <p className="mb-1 text-xs font-medium text-muted">{t('twin.risk.title')}</p>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-semibold">{formatNumber(frame.assessment.risk.score, lang, 0)}</span>
                <RiskBadge level={frame.assessment.risk.level} />
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-muted">{t('ab.eta.label')}</p>
              <p className="text-base font-semibold">
                {eta === null ? t('ab.eta.none') : t('ab.eta.value', { minutes: Math.max(1, Math.round(eta / 60)) })}
              </p>
            </div>
          </>
        ) : null}
      </div>

      <EChart option={option} height={300} label={t('ab.chart.aria', { panel: title })} className="mt-2" />
    </section>
  );
}
