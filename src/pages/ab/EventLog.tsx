import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import type { TimelineEvent } from '@/eval/timeline';
import { formatClock } from '@/lib/timelineSeries';

export interface LoggedEvent extends TimelineEvent {
  world: 'bms' | 'voltify';
}

function eventText(t: TFunction, e: TimelineEvent): string {
  switch (e.kind) {
    case 'ai_alert':
      return t('ab.events.ai_alert');
    case 'derate_sent':
      return t('ab.events.derate_sent', { percent: Math.round((e.derate ?? 0) * 100) });
    case 'shipper_notified':
      return e.stationId !== undefined
        ? t('ab.events.shipper_notified', { station: e.stationId, distance: Math.round(e.distanceM ?? 0) })
        : t('ab.events.shipper_notified_nostation');
    case 'swap_done':
      return t('ab.events.swap_done');
    case 'bms_trip':
      return t('ab.events.bms_trip');
    case 'vehicle_stopped':
      return t('ab.events.vehicle_stopped');
  }
}

/** Events that have happened by now, newest last, each tagged with the world it happened in. */
export function EventLog({ events }: { events: readonly LoggedEvent[] }) {
  const { t } = useTranslation();
  return (
    <Card>
      <h2 className="text-base font-semibold">{t('ab.events.title')}</h2>
      {events.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{t('ab.events.empty')}</p>
      ) : (
        <ol className="mt-3 space-y-2">
          {events.map((e, i) => (
            <li key={`${e.world}-${e.kind}-${i}`} className="flex items-start gap-3 text-sm">
              <span className="w-12 shrink-0 font-semibold text-text">{formatClock(e.tS)}</span>
              <span
                className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${
                  e.world === 'voltify' ? 'border-accent/50 text-accent' : 'border-border text-muted'
                }`}
              >
                {e.world === 'voltify' ? t('ab.events.worldVoltify') : t('ab.events.worldBms')}
              </span>
              <span className="min-w-0 text-text">{eventText(t, e)}</span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
