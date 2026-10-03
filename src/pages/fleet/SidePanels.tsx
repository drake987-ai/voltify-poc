import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { RiskBadge } from '@/components/ui/RiskBadge';
import {
  FLAG_DERATING,
  FLAG_LEARNING,
  FLAG_SWAPPED,
  FLAG_TRIPPED,
  type AlertRecord,
  type FleetLayout,
  type FleetSnapshot,
} from '@/fleet';
import { formatClock } from '@/lib/timelineSeries';
import { formatNumber } from '@/lib/format';

export function AlertList({ alerts, onSelect }: { alerts: readonly AlertRecord[]; onSelect: (id: string) => void }) {
  const { t } = useTranslation();
  const newestFirst = [...alerts].reverse();
  return (
    <Card>
      <h2 className="text-base font-semibold">{t('fleet.alerts.title')}</h2>
      {newestFirst.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{t('fleet.alerts.empty')}</p>
      ) : (
        <ul className="mt-3 max-h-80 space-y-1.5 overflow-y-auto pr-1">
          {newestFirst.map((a, i) => (
            <li key={`${a.id}-${a.tS}-${i}`}>
              <button
                type="button"
                onClick={() => onSelect(a.id)}
                className="flex w-full items-start gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2 text-left text-sm transition-colors hover:border-accent"
              >
                <span className="w-11 shrink-0 pt-0.5 text-xs font-semibold text-muted">{formatClock(a.tS)}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">#{a.id}</span>
                    <RiskBadge level={a.level} />
                    <span className="text-xs text-muted">{Math.round(a.score)}</span>
                  </span>
                  {a.topSignal ? <span className="mt-0.5 block text-xs text-muted">{t(`twin.signals.${a.topSignal}.name`)}</span> : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function SelectedPanel({
  snapshot,
  layout,
  selectedId,
  onClear,
}: {
  snapshot: FleetSnapshot | null;
  layout: FleetLayout | null;
  selectedId: string | null;
  onClear: () => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'vi';
  const d = snapshot?.selected ?? null;
  const index = d?.index ?? -1;
  const flags = index >= 0 && snapshot ? snapshot.flags[index] : 0;

  if (!selectedId || !d || !snapshot || !layout) {
    return (
      <Card>
        <h2 className="text-base font-semibold">{t('fleet.selected.title')}</h2>
        <p className="mt-3 text-sm text-muted">{t('fleet.selected.none')}</p>
      </Card>
    );
  }

  const statuses: string[] = [];
  if (flags & FLAG_LEARNING) statuses.push(t('fleet.selected.status.learning'));
  if (flags & FLAG_DERATING) statuses.push(t('fleet.selected.status.derating'));
  if (flags & FLAG_SWAPPED) statuses.push(t('fleet.selected.status.swapped'));
  if (flags & FLAG_TRIPPED) statuses.push(t('fleet.selected.status.tripped'));
  const n = (x: number, dp = 1) => formatNumber(x, lang, dp);

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">#{d.id}</h2>
          <p className="text-xs text-muted">{t(`brands.${d.brand}`)}</p>
        </div>
        <div className="flex items-center gap-2">
          <RiskBadge level={d.assessment.risk.level} />
          <button type="button" onClick={onClear} className="rounded-md px-2 py-1 text-xs text-muted hover:text-text">
            {t('fleet.trace.close')}
          </button>
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        {(
          [
            [t('twin.risk.title'), `${n(d.assessment.risk.score, 0)}`],
            [t('twin.readout.coreTemp'), `${n(d.telemetry.coreTemp)} °C`],
            [t('twin.readout.soc'), `${n(d.telemetry.soc * 100, 0)} %`],
            [t('twin.readout.soh'), d.assessment.learning ? t('twin.readout.learning') : `${n(d.vitals.health.pct, 0)} %`],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="flex justify-between gap-2 border-b border-border/60 py-1">
            <dt className="text-muted">{label}</dt>
            <dd className="font-semibold">{value}</dd>
          </div>
        ))}
      </dl>

      {statuses.length > 0 ? <p className="mt-3 text-sm font-medium text-accent">{statuses.join(' · ')}</p> : null}

      <p className="mt-3 text-xs leading-snug text-muted">
        <span className="font-semibold text-text">{t('fleet.selected.roleLabel')}: </span>
        {t(`fleet.selected.roles.${d.role}`)}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Link to={`/twin/${d.id}`} className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm font-medium transition-colors hover:border-accent hover:text-accent">
          {t('fleet.selected.openTwin')}
        </Link>
        <Link to={`/vitals/${d.id}`} className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm font-medium transition-colors hover:border-accent hover:text-accent">
          {t('fleet.selected.openVitals')}
        </Link>
      </div>
    </Card>
  );
}
