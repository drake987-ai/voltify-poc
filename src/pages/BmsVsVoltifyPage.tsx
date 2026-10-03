import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BRANDS, type Brand } from '@/adapters';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { useAsync } from '@/hooks/useAsync';
import { runABAsync } from '@/workers/client';
import { AbView } from '@/pages/ab/AbView';
import {
  AB_INTERVENTIONS,
  AB_SCENARIOS,
  abSpec,
  type AbIntervention,
  type AbScenario,
} from '@/pages/ab/abConfig';

export default function BmsVsVoltifyPage() {
  const { t } = useTranslation();
  const [scenario, setScenario] = useState<AbScenario>('severeHeatLoad');
  const [brand, setBrand] = useState<Brand>('A');
  const [intervention, setIntervention] = useState<AbIntervention>('full');

  const spec = abSpec(scenario, brand, intervention);
  const key = JSON.stringify(spec);
  const state = useAsync(() => runABAsync(spec), key);

  return (
    <>
      <PageHeader page="bms" dataSource={{ kind: 'simulated' }} />

      <Card className="mb-4">
        <div className="grid gap-3 md:grid-cols-3">
          <Select
            label={t('ab.controls.scenario')}
            value={scenario}
            onChange={setScenario}
            options={AB_SCENARIOS.map((s) => ({ value: s, label: t(`ab.scenarios.${s}.name`) }))}
          />
          <Select
            label={t('ab.controls.brand')}
            value={brand}
            onChange={setBrand}
            options={BRANDS.map((b) => ({ value: b, label: t(`brands.${b}`) }))}
          />
          <Select
            label={t('ab.controls.intervention')}
            value={intervention}
            onChange={setIntervention}
            options={AB_INTERVENTIONS.map((i) => ({ value: i, label: t(`ab.interventions.${i}`) }))}
          />
        </div>
        <p className="mt-3 text-sm leading-relaxed text-muted">{t(`ab.scenarios.${scenario}.desc`)}</p>
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
        <AbView key={key} ab={state.data} />
      )}
    </>
  );
}
