import { Activity, Battery, Gauge, ShieldAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { DISCHARGE_WEIGHTS, explainAssessment } from '@/ai';
import { Card } from '@/components/ui/Card';
import { RiskBadge } from '@/components/ui/RiskBadge';
import { DEFAULT_POLICY, nearestStation } from '@/intervention';
import { formatNumber } from '@/lib/format';
import type { SelectedDetail } from '@/fleet';

function VitalCard({ icon, title, children, explain }: { icon: ReactNode; title: string; children: ReactNode; explain: string }) {
  return (
    <Card className="flex flex-col">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <span aria-hidden className="text-accent">
          {icon}
        </span>
        {title}
      </h2>
      <div className="mt-3 flex-1">{children}</div>
      <p className="mt-4 border-t border-border pt-3 text-sm leading-relaxed text-muted">{explain}</p>
    </Card>
  );
}

const Bar = ({ pct, color = 'var(--c-accent)' }: { pct: number; color?: string }) => (
  <div className="h-2 overflow-hidden rounded-full bg-border" role="presentation">
    <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
  </div>
);

const Big = ({ value, unit }: { value: string; unit: string }) => (
  <p className="text-4xl font-semibold tracking-tight">
    {value}
    <span className="ml-1 text-lg font-medium text-muted">{unit}</span>
  </p>
);

export function VitalCards({ detail }: { detail: SelectedDetail }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'vi';
  const n = (x: number, d = 0) => formatNumber(x, lang, d);
  const { vitals: v, telemetry, assessment: a } = detail;

  // Charge left, set against how far the nearest swap station is.
  const nearest = nearestStation(cityOf(detail), telemetry.lat, telemetry.lng);
  const rideMin = nearest ? nearest.distanceM / DEFAULT_POLICY.rideSpeedMs / 60 : null;
  const mayNotReach = rideMin !== null && v.soc.remainingMin !== null && v.soc.remainingMin < rideMin * 1.5;

  const reasons = explainAssessment(a).slice(0, 3);
  const d = v.discharge;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <VitalCard icon={<Battery className="size-5" />} title={t('vitals.soc.title')} explain={t('vitals.soc.explain')}>
        <Big value={n(v.soc.pct)} unit="%" />
        <div className="mt-2">
          <Bar pct={v.soc.pct} color={v.soc.swapSoon ? 'var(--c-risk-warning)' : 'var(--c-accent)'} />
        </div>
        <p className="mt-3 text-sm">
          {v.soc.remainingMin === null
            ? t('vitals.soc.idle')
            : t('vitals.soc.remaining', { minutes: n(v.soc.remainingMin) })}
        </p>
        {nearest && rideMin !== null ? (
          <p className="mt-1 text-sm text-muted">
            {t('vitals.soc.station', { id: nearest.station.id, distance: n(nearest.distanceM), minutes: n(Math.max(1, rideMin)) })}
          </p>
        ) : null}
        {v.soc.swapSoon || mayNotReach ? (
          <p className="mt-3 rounded-lg border border-risk-warning/50 bg-risk-warning/10 px-3 py-2 text-sm font-medium text-risk-warning" role="status">
            {mayNotReach ? t('vitals.soc.alertReach') : t('vitals.soc.alertSwap')}
          </p>
        ) : null}
      </VitalCard>

      <VitalCard icon={<Activity className="size-5" />} title={t('vitals.health.title')} explain={t('vitals.health.explain')}>
        {a.learning ? (
          <p className="text-sm text-muted">{t('twin.risk.learning')}</p>
        ) : (
          <>
            <Big value={n(v.health.pct)} unit="%" />
            <div className="mt-2">
              <Bar pct={v.health.pct} />
            </div>
            <p className="mt-3 text-sm font-medium">{t(`twin.readout.sohClass.${v.health.class}`)}</p>
            <p className="mt-1 text-sm text-muted">{t(`vitals.health.route.${v.health.route}`)}</p>
            <p className="mt-1 text-xs text-muted">{t('vitals.health.confidence', { percent: Math.round(v.health.confidence * 100) })}</p>
          </>
        )}
      </VitalCard>

      <VitalCard icon={<ShieldAlert className="size-5" />} title={t('vitals.safety.title')} explain={t('vitals.safety.explain')}>
        <div className="flex items-center gap-3">
          <Big value={n(v.safety.score)} unit="/100" />
          <RiskBadge level={v.safety.level} />
        </div>
        <p className="mt-3 text-sm">
          {v.safety.etaMin === null
            ? t('vitals.safety.noEta')
            : t('vitals.safety.eta', { minutes: n(Math.max(1, v.safety.etaMin)) })}
        </p>
        {reasons.length > 0 ? (
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
            {reasons.map((r) => (
              <li key={r.signal}>
                {t(`twin.signals.${r.signal}.name`)}
                <span className="text-text"> ({t('twin.risk.points', { points: n(r.points, 1) })})</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted">{t('twin.risk.empty')}</p>
        )}
        <Link to={`/twin/${detail.id}`} className="mt-3 inline-block text-sm font-medium text-accent underline">
          {t('fleet.selected.openTwin')}
        </Link>
      </VitalCard>

      <VitalCard icon={<Gauge className="size-5" />} title={t('vitals.discharge.title')} explain={t('vitals.discharge.explain')}>
        {a.learning ? (
          <p className="text-sm text-muted">{t('twin.risk.learning')}</p>
        ) : (
          <>
            <Big value={n(d.score)} unit="/100" />
            <div className="mt-2">
              <Bar pct={d.score} />
            </div>
            <dl className="mt-3 space-y-1 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">{t('vitals.discharge.efficiency')}</dt>
                <dd className="font-semibold">{d.efficiencyPct === null ? t('vitals.discharge.idleLoad') : `${n(d.efficiencyPct, 1)} %`}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">{t('vitals.discharge.loss')}</dt>
                <dd className="font-semibold">{n(d.lossW, 1)} W</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs font-semibold text-muted">{t('vitals.discharge.parts')}</p>
            <ul className="mt-1 space-y-1.5 text-sm">
              {(
                [
                  ['resistance', d.resistancePenalty],
                  ['weakCell', d.weakCellPenalty],
                  ['balance', d.balancePenalty],
                ] as const
              ).map(([key, penalty]) => (
                <li key={key}>
                  <div className="flex justify-between gap-3">
                    <span className="text-muted">{t(`vitals.discharge.penalty.${key}`)}</span>
                    <span className="font-semibold">{t('vitals.discharge.points', { points: n(DISCHARGE_WEIGHTS[key] * penalty * 100, 1) })}</span>
                  </div>
                  <Bar pct={penalty * 100} color="var(--c-risk-warning)" />
                </li>
              ))}
            </ul>
            {d.needsBalancing ? (
              <p className="mt-3 rounded-lg border border-accent/50 bg-accent/10 px-3 py-2 text-sm font-medium text-accent" role="status">
                {t('vitals.discharge.balance')}
              </p>
            ) : null}
          </>
        )}
      </VitalCard>
    </div>
  );
}

function cityOf(detail: SelectedDetail): 'hcmc' | 'hanoi' {
  // Latitude tells the city apart (Ha Noi is around 21 N, TP.HCM around 10.8 N).
  return detail.telemetry.lat > 15 ? 'hanoi' : 'hcmc';
}
