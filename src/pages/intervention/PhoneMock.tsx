import { BatteryCharging, Check, Circle, CircleDot, Signal, TriangleAlert, Wifi } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { RiskBadge } from '@/components/ui/RiskBadge';
import type { Timeline } from '@/eval/timeline';
import { formatNumber } from '@/lib/format';
import { frameAt } from '@/lib/timelineSeries';
import { SIM } from '@/sim';
import { phoneStateAt } from './phoneState';
import { StationMap } from './StationMap';

type StepState = 'done' | 'now' | 'todo';

function Step({ state, children }: { state: StepState; children: ReactNode }) {
  const Icon = state === 'done' ? Check : state === 'now' ? CircleDot : Circle;
  const tone = state === 'done' ? 'text-emerald-700' : state === 'now' ? 'font-semibold text-slate-900' : 'text-slate-500';
  return (
    <li className={`flex items-start gap-2 text-[13px] leading-snug ${tone}`}>
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </li>
  );
}

const clockFormat = (lang: string) =>
  new Intl.DateTimeFormat(lang === 'vi' ? 'vi-VN' : 'en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Ho_Chi_Minh' });

/** The shipper's app at one moment of the replay: a framed mockup, always light, as a phone would show it. */
export function PhoneMock({ timeline, tS }: { timeline: Timeline; tS: number }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'vi';
  const n = (x: number, dp = 0) => formatNumber(x, lang, dp);
  const s = phoneStateAt(timeline, tS);
  const frame = frameAt(timeline.frames, tS);
  const a = frame?.assessment ?? null;
  const alerting = s.stage !== 'watching';
  const rideStep: StepState = s.stage === 'swapping' || s.stage === 'done' ? 'done' : 'now';
  const swapStep: StepState = s.stage === 'done' ? 'done' : s.stage === 'swapping' ? 'now' : 'todo';

  const time = clockFormat(lang).format(new Date(SIM.epochMs + tS * 1000));

  return (
    <div
      role="group"
      aria-label={t('intervention.phone.aria')}
      className="mx-auto w-[300px] rounded-[2.6rem] border-[10px] border-neutral-800 bg-neutral-800 shadow-xl"
    >
      <div className="flex h-[590px] flex-col overflow-hidden rounded-[1.9rem] bg-white text-slate-900">
        <div className="flex items-center justify-between px-5 pt-3 text-[11px] font-semibold text-slate-700">
          <span>{time}</span>
          <span aria-hidden className="flex items-center gap-1">
            <Signal className="size-3.5" />
            <Wifi className="size-3.5" />
          </span>
        </div>

        <div className="mt-2 flex items-center justify-between border-b border-slate-200 px-4 pb-2">
          <p className="text-sm font-bold text-emerald-700">{t('intervention.phone.appName')}</p>
          <p className="text-xs text-slate-500">#{timeline.batteryId}</p>
        </div>

        <div className="flex-1 space-y-3 overflow-hidden px-4 py-3">
          {!alerting ? (
            <>
              <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
                <Check aria-hidden className="size-4" />
                {t('intervention.phone.fine')}
              </div>
              <dl className="grid grid-cols-2 gap-2 text-center">
                <div className="rounded-xl bg-slate-100 p-2">
                  <dt className="text-[11px] text-slate-500">{t('twin.readout.soc')}</dt>
                  <dd className="text-xl font-bold">{frame ? `${n(frame.telemetry.soc * 100)} %` : '—'}</dd>
                </div>
                <div className="rounded-xl bg-slate-100 p-2">
                  <dt className="text-[11px] text-slate-500">{t('twin.readout.coreTemp')}</dt>
                  <dd className="text-xl font-bold">{frame ? `${n(frame.telemetry.coreTemp, 1)} °C` : '—'}</dd>
                </div>
              </dl>
              {a ? (
                <div className="flex items-center justify-between rounded-xl bg-slate-100 px-3 py-2 text-sm">
                  <span className="text-slate-600">{t('twin.risk.title')}</span>
                  <span className="flex items-center gap-2">
                    <b>{n(a.risk.score)}</b>
                    <RiskBadge level={a.risk.level} />
                  </span>
                </div>
              ) : null}
              <p className="text-xs leading-relaxed text-slate-500">{t('intervention.phone.fineHint')}</p>
            </>
          ) : (
            <>
              <div
                className={`rounded-xl border px-3 py-2.5 ${
                  s.stage === 'done' ? 'border-emerald-300 bg-emerald-50' : 'border-amber-300 bg-amber-50'
                }`}
                role="status"
              >
                <p className={`flex items-center gap-1.5 text-sm font-bold ${s.stage === 'done' ? 'text-emerald-800' : 'text-amber-900'}`}>
                  {s.stage === 'done' ? <BatteryCharging aria-hidden className="size-4" /> : <TriangleAlert aria-hidden className="size-4" />}
                  {s.stage === 'done' ? t('intervention.phone.doneTitle') : t('intervention.phone.alertTitle')}
                </p>
                <p className="mt-1 text-[13px] leading-snug text-slate-800">
                  {s.stage === 'done'
                    ? t('intervention.phone.doneBody')
                    : s.station && s.distanceM !== null
                      ? t('intervention.phone.alertBody', {
                          temp: n(frame?.telemetry.coreTemp ?? 0, 1),
                          percent: Math.round(s.derate * 100),
                          station: s.station.id,
                          distance: n(s.distanceM),
                        })
                      : t('intervention.phone.alertBodyNoStation', { percent: Math.round(s.derate * 100) })}
                </p>
              </div>

              {s.station ? <StationMap city={timeline.city} state={s} /> : null}

              <ul className="space-y-1.5">
                <Step state="done">{t('intervention.phone.steps.derate', { percent: Math.round(s.derate * 100) })}</Step>
                <Step state={rideStep}>
                  {s.station && (s.stage === 'swapping' || s.stage === 'done')
                    ? t('intervention.phone.steps.arrived', { station: s.station.id })
                    : s.remainingM !== null && s.station
                      ? t('intervention.phone.steps.ride', { station: s.station.id, distance: n(Math.round(s.remainingM / 10) * 10) })
                      : t('intervention.phone.steps.rideNearest')}
                </Step>
                <Step state={swapStep}>{t('intervention.phone.steps.swap')}</Step>
                <Step state={s.stage === 'done' ? 'now' : 'todo'}>{t('intervention.phone.steps.resume')}</Step>
              </ul>
            </>
          )}
        </div>

        <div className="flex justify-around border-t border-slate-200 py-2 text-[10px] font-medium text-slate-500" aria-hidden>
          <span className="font-bold text-emerald-700">{t('intervention.phone.tabs.pack')}</span>
          <span>{t('intervention.phone.tabs.stations')}</span>
          <span>{t('intervention.phone.tabs.orders')}</span>
        </div>
      </div>
    </div>
  );
}
