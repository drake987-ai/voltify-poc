import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EChart } from '@/components/charts/EChart';
import { useChartColors } from '@/components/charts/useChartColors';
import { Card } from '@/components/ui/Card';
import { PlaybackBar } from '@/components/ui/PlaybackBar';
import { Stat } from '@/components/ui/Stat';
import type { Timeline } from '@/eval/timeline';
import { usePlayback } from '@/hooks/usePlayback';
import { formatNumber } from '@/lib/format';
import { countUpTo, frameAt } from '@/lib/timelineSeries';
import { ExplanationPanel } from './ExplanationPanel';
import { RiskPanel } from './RiskPanel';
import { cellHeatmapOption, cellsNowOption, heatOption, riskOption, sohOption, temperatureOption, type ChartBase } from './twinCharts';

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="min-w-0">
      <h2 className="mb-1 text-sm font-semibold">{title}</h2>
      {children}
    </Card>
  );
}

/** One battery played back at the AI's pace: the numbers, the charts and the reasons, all at the same moment. */
export function TwinView({ timeline }: { timeline: Timeline }) {
  const { t, i18n } = useTranslation();
  const colors = useChartColors();
  const durationS = timeline.spec.durationS;
  const playback = usePlayback(durationS, { autoplay: true, speed: 60 });
  const [showTruth, setShowTruth] = useState(false);
  const lang = i18n.resolvedLanguage ?? 'vi';

  const tS = playback.tS;
  const frame = frameAt(timeline.frames, tS);
  const index = countUpTo(timeline.frames, tS) - 1;
  const a = frame?.assessment ?? null;
  const etaS = a?.thermal.etaToLimitS ?? null;
  const base: ChartBase = { timeline, tS, durationS, colors, t };

  const charts = useMemo(
    () => ({
      temperature: temperatureOption({ ...base, showTruth, etaS }),
      heat: heatOption({ ...base, showTruth }),
      heatmap: cellHeatmapOption(base),
      cellsNow: cellsNowOption({ ...base, assessment: a, index }),
      risk: riskOption(base),
      soh: sohOption({ ...base, showTruth }),
    }),
    // `base` is rebuilt every render from the values listed here.
    [timeline, tS, durationS, colors, t, showTruth, etaS, a, index],
  );

  const tel = frame?.telemetry;
  const packV = tel ? tel.cellVoltages.reduce((s, v) => s + v, 0) : null;
  const dash = '—';
  const n = (x: number | null | undefined, d: number) => (x === null || x === undefined || !Number.isFinite(x) ? dash : formatNumber(x, lang, d));

  return (
    <div className="space-y-4">
      <PlaybackBar playback={playback} durationS={durationS} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <RiskPanel assessment={a} />
        <ExplanationPanel assessment={a} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={t('twin.readout.coreTemp')} value={`${n(tel?.coreTemp, 1)} °C`} />
        <Stat label={t('twin.readout.current')} value={`${n(tel?.current, 1)} A`} />
        <Stat label={t('twin.readout.packVoltage')} value={`${n(packV, 2)} V`} />
        <Stat label={t('twin.readout.soc')} value={`${n(tel ? tel.soc * 100 : null, 0)} %`} />
        <Stat
          label={t('twin.readout.r25')}
          value={a && !a.learning ? `${n(a.impedance.r25mOhm, 0)} mΩ` : t('twin.readout.learning')}
        />
        <Stat
          label={t('twin.readout.soh')}
          value={a && !a.learning ? `${n(a.impedance.sohEst * 100, 0)} %` : t('twin.readout.learning')}
          hint={a && !a.learning ? t(`twin.readout.sohClass.${a.impedance.class}`) : undefined}
          tone="accent"
        />
        <Stat
          label={t('twin.readout.eta')}
          value={etaS === null ? t('twin.readout.etaNone') : t('ab.eta.value', { minutes: Math.max(1, Math.round(etaS / 60)) })}
        />
        <Stat label={t('twin.readout.heat')} value={`${n(a?.thermal.unexplainedHeatW, 1)} W`} />
      </div>

      <label className="flex items-start gap-3 rounded-xl border border-border bg-surface p-3 text-sm">
        <input
          type="checkbox"
          checked={showTruth}
          onChange={(e) => setShowTruth(e.target.checked)}
          className="mt-0.5 size-4 accent-[var(--c-accent)]"
        />
        <span>
          <span className="font-medium text-text">{t('twin.truth.toggle')}</span>
          <span className="block text-xs text-muted">{t('twin.truth.hint')}</span>
        </span>
      </label>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title={t('twin.charts.temperature')}>
          <EChart option={charts.temperature} height={320} label={t('twin.charts.aria', { title: t('twin.charts.temperature') })} />
        </ChartCard>
        <ChartCard title={t('twin.charts.heat')}>
          <EChart option={charts.heat} height={320} label={t('twin.charts.aria', { title: t('twin.charts.heat') })} />
        </ChartCard>
        <ChartCard title={t('twin.charts.cells')}>
          <EChart option={charts.heatmap} height={360} label={t('twin.charts.aria', { title: t('twin.charts.cells') })} />
        </ChartCard>
        <ChartCard title={t('twin.charts.cellsNow')}>
          <EChart option={charts.cellsNow} height={360} label={t('twin.charts.aria', { title: t('twin.charts.cellsNow') })} />
        </ChartCard>
        <ChartCard title={t('twin.charts.risk')}>
          <EChart option={charts.risk} height={340} label={t('twin.charts.aria', { title: t('twin.charts.risk') })} />
        </ChartCard>
        <ChartCard title={t('twin.charts.soh')}>
          <EChart option={charts.soh} height={340} label={t('twin.charts.aria', { title: t('twin.charts.soh') })} />
        </ChartCard>
      </div>
    </div>
  );
}
