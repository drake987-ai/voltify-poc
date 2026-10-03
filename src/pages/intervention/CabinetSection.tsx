import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { EChart } from '@/components/charts/EChart';
import { useChartColors } from '@/components/charts/useChartColors';
import { AssumptionList } from '@/components/ui/AssumptionList';
import { Card } from '@/components/ui/Card';
import { PlaybackBar } from '@/components/ui/PlaybackBar';
import type { CabinetAB } from '@/eval/cabinet';
import { usePlayback } from '@/hooks/usePlayback';
import { formatNumber } from '@/lib/format';
import { formatClock } from '@/lib/timelineSeries';
import { fadePerEfc } from '@/sim';
import { buildCabinetOption, chargeSeriesOf, type CabinetMetric } from './cabinetChart';
import { CabinetMock } from './CabinetMock';
import { CommandLog } from './CommandLog';
import { cabinetCommandLog } from './commands';
import { CABINET_DEFAULT_SPEED, CABINET_DURATION_S, CABINET_SPEEDS, CABINET_TAIL_S } from './config';

function CabinetChart({ cab, metric, tS, windowS }: { cab: CabinetAB; metric: CabinetMetric; tS: number; windowS: number }) {
  const { t } = useTranslation();
  const colors = useChartColors();
  const events = useMemo(() => cab.with.cabinetEvents.filter((e) => e.tS <= windowS), [cab, windowS]);
  const option = useMemo(
    () => buildCabinetOption({ without: cab.without, withCut: cab.with, metric, tS, windowS, colors, t, events }),
    [cab, metric, tS, windowS, colors, t, events],
  );
  const title = t(metric === 'temperature' ? 'intervention.cabinet.chartTemp' : 'intervention.cabinet.chartCurrent');
  return (
    <Card>
      <h3 className="text-base font-semibold">{title}</h3>
      <EChart option={option} height={280} label={title} className="mt-2" />
    </Card>
  );
}

/** The charging-cabinet half: the same pack charged twice in a hot cabinet, with and without the platform cutting the current. */
export function CabinetSection({ cab }: { cab: CabinetAB }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'vi';
  const n = (x: number, dp = 0) => formatNumber(x, lang, dp);
  const { summaryWithout: a, summaryWith: b, lifetimeWithout, lifetimeWith, assumptions } = cab;

  const endOf = (s: typeof a) => s.fullS ?? s.chargingS;
  const windowS = Math.min(CABINET_DURATION_S, Math.max(endOf(a), endOf(b)) + CABINET_TAIL_S);
  const playback = usePlayback(windowS, { autoplay: true, speed: CABINET_DEFAULT_SPEED, speeds: CABINET_SPEEDS });
  const { tS } = playback;

  const seriesWithout = chargeSeriesOf(cab.without);
  const seriesWith = chargeSeriesOf(cab.with);
  const log = useMemo(() => cabinetCommandLog(cab.with, windowS), [cab, windowS]);

  const minutes = (s: number | null) => (s === null ? t('intervention.cabinet.notFull') : t('intervention.cabinet.minutes', { minutes: n(s / 60) }));
  const pct = (x: number) => `${n(x * 100, 4)} %`;
  const delta = (without: number, withCut: number) => {
    const d = (withCut / without - 1) * 100;
    return `${d > 0 ? '+' : '−'}${n(Math.abs(d), 1)} %`;
  };
  const rideFade = fadePerEfc(assumptions.rideTempC);
  const fullRatio = a.fullS !== null && b.fullS !== null ? b.fullS / a.fullS : null;

  const rows: { label: string; without: string; withCut: string; change?: string }[] = [
    {
      label: t('intervention.cabinet.kpi.peak'),
      without: `${n(a.peakTempC, 1)} °C`,
      withCut: `${n(b.peakTempC, 1)} °C`,
      change: `${n(b.peakTempC - a.peakTempC, 1)} °C`,
    },
    {
      label: t('intervention.cabinet.kpi.mean'),
      without: `${n(a.meanTempC, 1)} °C`,
      withCut: `${n(b.meanTempC, 1)} °C`,
      change: `${n(b.meanTempC - a.meanTempC, 1)} °C`,
    },
    {
      label: t('intervention.cabinet.kpi.full'),
      without: minutes(a.fullS),
      withCut: minutes(b.fullS),
      change: fullRatio === null ? undefined : `×${n(fullRatio, 1)}`,
    },
    {
      label: t('intervention.cabinet.kpi.fade'),
      without: pct(a.meanFadePerEfc),
      withCut: pct(b.meanFadePerEfc),
      change: delta(a.meanFadePerEfc, b.meanFadePerEfc),
    },
    {
      label: t('intervention.cabinet.kpi.life'),
      without: t('intervention.cabinet.days', { days: n(lifetimeWithout.daysToEol) }),
      withCut: t('intervention.cabinet.days', { days: n(lifetimeWith.daysToEol) }),
      change: `+${n(cab.lifetimeGainPct, 1)} %`,
    },
  ];

  return (
    <section aria-labelledby="intervention-cabinet" className="space-y-4">
      <div>
        <h2 id="intervention-cabinet" className="text-lg font-semibold tracking-tight">
          {t('intervention.cabinet.title')}
        </h2>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted">{t('intervention.cabinet.intro')}</p>
      </div>

      <PlaybackBar playback={playback} durationS={windowS} />

      <div className="grid gap-4 md:grid-cols-2">
        <CabinetMock
          title={t('intervention.cabinet.worlds.without')}
          slot="03"
          batteryId={cab.without.batteryId}
          series={seriesWithout}
          tS={tS}
          managed={false}
        />
        <CabinetMock
          title={t('intervention.cabinet.worlds.with')}
          slot="03"
          batteryId={cab.with.batteryId}
          series={seriesWith}
          tS={tS}
          managed
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <CabinetChart cab={cab} metric="temperature" tS={tS} windowS={windowS} />
        <CabinetChart cab={cab} metric="current" tS={tS} windowS={windowS} />
      </div>

      <Card>
        <h3 className="text-base font-semibold">{t('intervention.cabinet.kpi.title')}</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th scope="col" className="py-1.5 pr-3 font-medium" />
                <th scope="col" className="px-3 py-1.5 font-medium">{t('intervention.cabinet.worlds.without')}</th>
                <th scope="col" className="px-3 py-1.5 font-medium">{t('intervention.cabinet.worlds.with')}</th>
                <th scope="col" className="py-1.5 pl-3 font-medium">{t('intervention.cabinet.kpi.change')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className="border-b border-border/60">
                  <th scope="row" className="py-2 pr-3 text-left font-medium">{r.label}</th>
                  <td className="px-3 py-2">{r.without}</td>
                  <td className="px-3 py-2 font-semibold text-accent">{r.withCut}</td>
                  <td className="py-2 pl-3 text-muted">{r.change ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <details className="mt-4 rounded-lg border border-border bg-surface-2 p-3">
          <summary className="cursor-pointer text-sm font-semibold">{t('intervention.cabinet.trace.title')}</summary>
          <div className="mt-3 space-y-3 text-sm leading-relaxed">
            <p>{t('intervention.cabinet.trace.formula')}</p>
            <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
              {(
                [
                  [t('intervention.cabinet.trace.chargeFade', { world: t('intervention.cabinet.worlds.without') }), pct(a.meanFadePerEfc)],
                  [t('intervention.cabinet.trace.chargeFade', { world: t('intervention.cabinet.worlds.with') }), pct(b.meanFadePerEfc)],
                  [t('intervention.cabinet.trace.rideFade', { temp: n(assumptions.rideTempC) }), pct(rideFade)],
                  [t('intervention.cabinet.trace.mixedFade', { world: t('intervention.cabinet.worlds.without') }), pct(lifetimeWithout.fadePerEfc)],
                  [t('intervention.cabinet.trace.mixedFade', { world: t('intervention.cabinet.worlds.with') }), pct(lifetimeWith.fadePerEfc)],
                  [t('intervention.cabinet.trace.efc', { world: t('intervention.cabinet.worlds.without') }), n(lifetimeWithout.efcToEol)],
                  [t('intervention.cabinet.trace.efc', { world: t('intervention.cabinet.worlds.with') }), n(lifetimeWith.efcToEol)],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3 border-b border-border/60 py-1">
                  <dt className="text-muted">{label}</dt>
                  <dd className="font-semibold">{value}</dd>
                </div>
              ))}
            </dl>
            <h4 className="text-sm font-semibold">{t('fleet.trace.assumptions')}</h4>
            <AssumptionList ids={['rideTempC', 'efcPerDay', 'chargeShare']} values={assumptions} />
            <p className="text-xs text-muted">{t('fleet.trace.placeholder')}</p>
          </div>
        </details>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <CommandLog title={t('intervention.cabinet.logTitle')} entries={log} tS={tS} />
        <Card>
          <h3 className="text-base font-semibold">{t('intervention.cabinet.notes.title')}</h3>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted">
            <li>{t('intervention.cabinet.notes.scenario')}</li>
            <li>
              {fullRatio === null ? t('intervention.cabinet.notes.tradeoffUnknown') : t('intervention.cabinet.notes.tradeoff', { ratio: n(fullRatio, 1) })}
            </li>
            <li>{t('intervention.cabinet.notes.projection', { gain: n(cab.lifetimeGainPct, 1) })}</li>
            <li>{t('intervention.cabinet.notes.cooling')}</li>
          </ul>
          <p className="mt-3 text-xs text-muted">
            {t('intervention.cabinet.notes.window', { end: formatClock(windowS), seed: cab.with.spec.seed })}
          </p>
        </Card>
      </div>
    </section>
  );
}
