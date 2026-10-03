import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { liveTwinSpec } from '@/fleet';
import { formatNumber } from '@/lib/format';
import { BRAND_SPECS, SIM } from '@/sim';
import { useAsync } from '@/hooks/useAsync';
import { fleetController } from '@/workers/fleetClient';
import { runTimelineAsync } from '@/workers/client';
import { TWIN_CASE_PARAM, parseTwinCase, specOfCase } from '@/pages/twin/caseParam';
import { TWIN_CASES, TWIN_SPECS, type TwinCase } from '@/pages/twin/twinConfig';
import { TwinView } from '@/pages/twin/TwinView';

export default function TwinPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'vi';
  const { batteryId } = useParams<{ batteryId: string }>();
  const [params] = useSearchParams();
  const [twinCase, setTwinCase] = useState<TwinCase>('shortCircuit');

  // /twin?case=... replays one pack of an Evidence run (checked before use, it comes from the address bar).
  const caseText = params.get(TWIN_CASE_PARAM);
  const evidenceCase = useMemo(() => parseTwinCase(caseText), [caseText]);

  // /twin/:batteryId replays a pack of the live fleet (same seed, same policy); /twin offers the sample cases.
  const live = useMemo(
    () => (batteryId ? liveTwinSpec(fleetController.getState().config, batteryId) : null),
    [batteryId],
  );
  const spec = live ? live.spec : evidenceCase ? specOfCase(evidenceCase) : TWIN_SPECS[twinCase];
  const key = JSON.stringify(spec);
  const state = useAsync(() => runTimelineAsync(spec), key);

  return (
    <>
      <PageHeader page="twin" dataSource={{ kind: 'simulated' }} />

      <Card className="mb-4">
        {batteryId && !live ? (
          <p className="text-sm text-risk-danger" role="alert">
            {t('twin.live.notFound', { id: batteryId })}{' '}
            <Link to="/twin" className="font-medium text-accent underline">
              {t('twin.live.backToCases')}
            </Link>
          </p>
        ) : live ? (
          <div className="text-sm leading-relaxed">
            <p className="text-muted">
              <span className="font-semibold text-text">{t('fleet.selected.roleLabel')}: </span>
              {t(`fleet.selected.roles.${live.role}`)}
            </p>
            <p className="mt-1 text-muted">{t('twin.live.note', { seed: live.spec.seed })}</p>
            <Link to="/twin" className="mt-2 inline-block font-medium text-accent underline">
              {t('twin.live.backToCases')}
            </Link>
          </div>
        ) : evidenceCase ? (
          <div className="text-sm leading-relaxed">
            <p className="text-muted">
              {t('twin.fromEvidence.note', {
                id: evidenceCase.batteryId,
                seed: evidenceCase.seed,
                scenario: Array.isArray(evidenceCase.scenario) ? evidenceCase.scenario.join(' + ') : String(evidenceCase.scenario),
              })}
              {evidenceCase.inject ? ` ${t('twin.fromEvidence.short', { minutes: Math.round(evidenceCase.inject.atS / 60), ohm: formatNumber(evidenceCase.inject.fault.rShortMinOhm, lang, 2) })}` : ''}
            </p>
            <Link to="/evidence" className="mt-2 inline-block font-medium text-accent underline">
              {t('twin.fromEvidence.back')}
            </Link>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] md:items-end">
            <Select
              label={t('twin.controls.case')}
              value={twinCase}
              onChange={setTwinCase}
              options={TWIN_CASES.map((c) => ({ value: c, label: t(`twin.cases.${c}.name`) }))}
            />
            <p className="text-sm leading-relaxed text-muted">{t(`twin.cases.${twinCase}.desc`)}</p>
            {caseText ? (
              <p className="text-sm text-risk-warning md:col-span-2" role="alert">
                {t('twin.fromEvidence.invalid')}
              </p>
            ) : null}
          </div>
        )}
        {state.status === 'ready' ? (
          <p className="mt-3 border-t border-border pt-3 text-base font-semibold">
            {t('twin.heading', { id: state.data.batteryId })}
            <span className="ml-3 text-sm font-normal text-muted">
              {t('twin.meta', { brand: t(`brands.${state.data.brand}`), interval: BRAND_SPECS[state.data.brand].emitEveryTicks * SIM.tickS })}
            </span>
          </p>
        ) : null}
      </Card>

      {batteryId && !live ? null : state.status === 'loading' ? (
        <Card className="text-sm text-muted" aria-busy="true">
          {t('state.loading')}
        </Card>
      ) : state.status === 'error' ? (
        <Card className="text-sm text-risk-danger" role="alert">
          {t('state.error', { message: state.message })}
        </Card>
      ) : (
        <TwinView key={key} timeline={state.data} />
      )}
    </>
  );
}
