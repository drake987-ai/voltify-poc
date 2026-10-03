import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { PlaybackBar } from '@/components/ui/PlaybackBar';
import { Stat } from '@/components/ui/Stat';
import type { ABResult } from '@/eval/timeline';
import { usePlayback } from '@/hooks/usePlayback';
import { DEFAULT_POLICY } from '@/intervention';
import { formatNumber } from '@/lib/format';
import { frameAt, formatClock } from '@/lib/timelineSeries';
import { CommandLog } from './CommandLog';
import { vehicleCommandLog } from './commands';
import { VEHICLE_DEFAULT_SPEED, VEHICLE_SPEEDS, VEHICLE_TAIL_S } from './config';
import { PhoneMock } from './PhoneMock';

/** The vehicle half of the intervention: the shipper's phone and the commands behind it (one computed run). */
export function VehicleSection({ ab }: { ab: ABResult }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'vi';
  const timeline = ab.voltify;
  const sum = timeline.summary;
  const durationS = Math.min(timeline.spec.durationS, (sum.swapS ?? timeline.spec.durationS) + VEHICLE_TAIL_S);
  const playback = usePlayback(durationS, { autoplay: true, speed: VEHICLE_DEFAULT_SPEED, speeds: VEHICLE_SPEEDS });
  const { tS } = playback;

  const when = (at: number | null) => (at === null ? t('ab.kpi.none') : at <= tS ? formatClock(at) : t('ab.kpi.notYet'));
  const frame = frameAt(timeline.frames, tS);
  const peakSoFar = frame
    ? Math.max(...timeline.frames.filter((f) => f.tS <= tS).map((f) => f.truth.coreTempC))
    : Number.NaN;

  const p = DEFAULT_POLICY;
  return (
    <section aria-labelledby="intervention-vehicle" className="space-y-4">
      <div>
        <h2 id="intervention-vehicle" className="text-lg font-semibold tracking-tight">
          {t('intervention.vehicle.title')}
        </h2>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted">{t('intervention.vehicle.intro')}</p>
      </div>

      <PlaybackBar playback={playback} durationS={durationS} />

      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div>
          <PhoneMock timeline={timeline} tS={tS} />
          <p className="mx-auto mt-3 max-w-[300px] text-center text-xs leading-snug text-muted">{t('intervention.phone.caption')}</p>
        </div>

        <div className="min-w-0 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
            <Stat label={t('ab.kpi.alert')} value={when(sum.alertS)} hint={t('ab.kpi.alertHint')} tone="accent" />
            <Stat label={t('intervention.vehicle.stats.derate')} value={when(sum.derateS)} hint={t('intervention.vehicle.stats.derateHint', { percent: Math.round(p.derate * 100) })} />
            <Stat label={t('intervention.vehicle.stats.swap')} value={when(sum.swapS)} hint={t('intervention.vehicle.stats.swapHint')} tone="accent" />
            <Stat
              label={t('intervention.vehicle.stats.peak')}
              value={Number.isFinite(peakSoFar) ? `${formatNumber(peakSoFar, lang, 1)} °C` : '—'}
              hint={t('intervention.vehicle.stats.peakHint')}
            />
          </div>

          <CommandLog title={t('intervention.vehicle.logTitle')} entries={vehicleCommandLog(timeline)} tS={tS} />

          <Card>
            <h3 className="text-base font-semibold">{t('intervention.vehicle.policyTitle')}</h3>
            <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-muted">
              <li>{t('intervention.vehicle.policy.alert')}</li>
              <li>{t('intervention.vehicle.policy.derate', { seconds: p.commandLatencyS, percent: Math.round(p.derate * 100) })}</li>
              <li>{t('intervention.vehicle.policy.notify')}</li>
              <li>
                {t('intervention.vehicle.policy.swap', {
                  reaction: p.shipperReactionS,
                  speed: formatNumber(p.rideSpeedMs * 3.6, lang, 1),
                  handling: p.swapHandlingS,
                })}
              </li>
            </ol>
          </Card>
        </div>
      </div>
    </section>
  );
}
