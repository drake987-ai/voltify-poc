import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { BRAND_SPECS, SIM } from '@/sim';
import { useAsync } from '@/hooks/useAsync';
import { runTimelineAsync } from '@/workers/client';
import { TWIN_CASES, TWIN_SPECS, type TwinCase } from '@/pages/twin/twinConfig';
import { TwinView } from '@/pages/twin/TwinView';

export default function TwinPage() {
  const { t } = useTranslation();
  const [twinCase, setTwinCase] = useState<TwinCase>('shortCircuit');
  const spec = TWIN_SPECS[twinCase];
  const key = JSON.stringify(spec);
  const state = useAsync(() => runTimelineAsync(spec), key);

  return (
    <>
      <PageHeader page="twin" dataSource={{ kind: 'simulated' }} />

      <Card className="mb-4">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] md:items-end">
          <Select
            label={t('twin.controls.case')}
            value={twinCase}
            onChange={setTwinCase}
            options={TWIN_CASES.map((c) => ({ value: c, label: t(`twin.cases.${c}.name`) }))}
          />
          <p className="text-sm leading-relaxed text-muted">{t(`twin.cases.${twinCase}.desc`)}</p>
        </div>
        {state.status === 'ready' ? (
          <p className="mt-3 border-t border-border pt-3 text-base font-semibold">
            {t('twin.heading', { id: state.data.batteryId })}
            <span className="ml-3 text-sm font-normal text-muted">
              {t('twin.meta', { brand: t(`brands.${state.data.brand}`), interval: BRAND_SPECS[state.data.brand].emitEveryTicks * SIM.tickS })}
            </span>
          </p>
        ) : null}
      </Card>

      {state.status === 'loading' ? (
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
