import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { PlaybackBar } from '@/components/ui/PlaybackBar';
import { Stat } from '@/components/ui/Stat';
import type { ABResult } from '@/eval/timeline';
import { usePlayback } from '@/hooks/usePlayback';
import { formatNumber } from '@/lib/format';
import { formatClock } from '@/lib/timelineSeries';
import { AbPanel } from './AbPanel';
import { EventLog, type LoggedEvent } from './EventLog';

const peakUpTo = (frames: ABResult['bms']['frames'], tS: number): number => {
  let peak = -Infinity;
  for (const f of frames) {
    if (f.tS > tS) break;
    if (f.truth.coreTempC > peak) peak = f.truth.coreTempC;
  }
  return peak;
};

/** The replayable side-by-side comparison for one computed run (it restarts when remounted with a new run). */
export function AbView({ ab, harshCase = true }: { ab: ABResult; /** The note about a deliberately harsh scenario applies (false when the viewer built their own). */ harshCase?: boolean }) {
  const { t, i18n } = useTranslation();
  const { bms, voltify, leadTimeS } = ab;
  const durationS = bms.spec.durationS;
  const playback = usePlayback(durationS, { autoplay: true, speed: 60 });
  const { tS } = playback;
  const lang = i18n.resolvedLanguage ?? 'vi';

  const alertShown = voltify.summary.alertS !== null && voltify.summary.alertS <= tS;
  const tripShown = bms.summary.bmsTripS !== null && bms.summary.bmsTripS <= tS;
  const finished = playback.atEnd;

  const log: LoggedEvent[] = [
    ...bms.events.map((e) => ({ ...e, world: 'bms' as const })),
    ...voltify.events.map((e) => ({ ...e, world: 'voltify' as const })),
  ]
    .filter((e) => e.tS <= tS)
    .sort((a, b) => a.tS - b.tS);

  const bmsPeak = peakUpTo(bms.frames, tS);
  const voltifyPeak = peakUpTo(voltify.frames, tS);
  const minutes = (s: number) => formatNumber(s / 60, lang, 1);

  let leadValue: string;
  if (leadTimeS !== null && alertShown && tripShown) leadValue = t('ab.kpi.leadValue', { minutes: minutes(leadTimeS) });
  else if (finished && bms.summary.bmsTripS === null) leadValue = t('ab.kpi.none');
  else leadValue = t('ab.kpi.notYet');

  const bmsTripValue = tripShown
    ? formatClock(bms.summary.bmsTripS!)
    : finished && bms.summary.bmsTripS === null
      ? t('ab.kpi.noTrip')
      : t('ab.kpi.notYet');
  const alertValue = alertShown ? formatClock(voltify.summary.alertS!) : finished ? t('ab.kpi.none') : t('ab.kpi.notYet');

  // The verdict is written only once the run has been played to the end.
  let verdict: string;
  const v = voltify.summary;
  const b = bms.summary;
  if (!finished) verdict = t('ab.verdict.running');
  else if (v.alertS === null && b.bmsTripS === null) verdict = t('ab.verdict.control');
  else if (v.bmsTripS !== null && b.bmsTripS !== null) {
    verdict = t('ab.verdict.stillTrips', { delay: minutes(v.bmsTripS - b.bmsTripS) });
  } else if (leadTimeS !== null && v.swapS !== null && v.swapS < durationS * 10) {
    verdict = t('ab.verdict.protected', {
      lead: minutes(leadTimeS),
      peak: formatNumber(v.peakTempC, lang, 1),
      bmsPeak: formatNumber(b.peakTempC, lang, 1),
    });
  } else {
    verdict = t('ab.verdict.holdsWithoutSwap', { peak: formatNumber(v.peakTempC, lang, 1) });
  }

  return (
    <div className="space-y-4">
      <PlaybackBar playback={playback} durationS={durationS} />

      <div className="grid gap-4 xl:grid-cols-2">
        <AbPanel timeline={bms} side="bms" tS={tS} durationS={durationS} />
        <AbPanel timeline={voltify} side="voltify" tS={tS} durationS={durationS} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={t('ab.kpi.alert')} value={alertValue} hint={t('ab.kpi.alertHint')} tone="accent" />
        <Stat label={t('ab.kpi.bmsTrip')} value={bmsTripValue} hint={t('ab.kpi.bmsTripHint')} tone={tripShown ? 'danger' : 'text'} />
        <Stat label={t('ab.kpi.lead')} value={leadValue} hint={t('ab.kpi.leadHint')} tone="accent" />
        <Stat
          label={t('ab.kpi.peak')}
          value={`${Number.isFinite(bmsPeak) ? formatNumber(bmsPeak, lang, 1) : '—'} | ${Number.isFinite(voltifyPeak) ? formatNumber(voltifyPeak, lang, 1) : '—'} °C`}
          hint={t('ab.kpi.peakHint')}
        />
      </div>

      <Card aria-live="polite">
        <h2 className="text-base font-semibold">{t('ab.verdict.title')}</h2>
        <p className="mt-2 text-sm leading-relaxed text-text">{verdict}</p>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <EventLog events={log} />
        <Card>
          <h2 className="text-base font-semibold">{t('ab.notes.title')}</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted">
            {harshCase ? <li>{t('ab.notes.severe')}</li> : null}
            <li>
              {t('ab.notes.lead')}
              {leadTimeS !== null ? ` (${t('ab.kpi.leadValue', { minutes: minutes(leadTimeS) })})` : ''}
            </li>
            <li>{t('ab.notes.derate')}</li>
            <li>{t('ab.notes.assumptions')}</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
