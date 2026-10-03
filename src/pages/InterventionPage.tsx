import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BRANDS, type Brand } from '@/adapters';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { useAsync, type AsyncState } from '@/hooks/useAsync';
import { abSpec } from '@/pages/ab/abConfig';
import { CabinetSection } from '@/pages/intervention/CabinetSection';
import { cabinetSpec } from '@/pages/intervention/config';
import { VehicleSection } from '@/pages/intervention/VehicleSection';
import { runABAsync, runCabinetAsync } from '@/workers/client';

function Loading({ state }: { state: AsyncState<unknown> }) {
  const { t } = useTranslation();
  if (state.status === 'error') {
    return (
      <Card className="text-sm text-risk-danger" role="alert">
        {t('state.error', { message: state.message })}
      </Card>
    );
  }
  return (
    <Card className="text-sm text-muted" aria-busy="true">
      {t('state.loading')}
    </Card>
  );
}

export default function InterventionPage() {
  const { t } = useTranslation();
  const [brand, setBrand] = useState<Brand>('A');

  // The vehicle story is the "full intervention" run of the same hero scenario as the BMS-vs-Voltify screen.
  const vehicleSpec = abSpec('severeHeatLoad', brand, 'full');
  const vehicle = useAsync(() => runABAsync(vehicleSpec), JSON.stringify(vehicleSpec));
  const cabSpec = cabinetSpec(brand);
  const cabinet = useAsync(() => runCabinetAsync(cabSpec), JSON.stringify(cabSpec));

  return (
    <>
      <PageHeader page="intervention" dataSource={{ kind: 'simulated' }} />

      <Card className="mb-6 border-accent/40">
        <h2 className="text-base font-semibold">{t('intervention.phases.title')}</h2>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted">
          <li>{t('intervention.phases.one')}</li>
          <li>{t('intervention.phases.two')}</li>
        </ul>
      </Card>

      <Card className="mb-6">
        <div className="grid gap-3 md:grid-cols-[minmax(0,260px)_minmax(0,1fr)] md:items-end">
          <Select
            label={t('ab.controls.brand')}
            value={brand}
            onChange={setBrand}
            options={BRANDS.map((b) => ({ value: b, label: t(`brands.${b}`) }))}
          />
          <p className="text-sm leading-relaxed text-muted">{t('intervention.controls.hint')}</p>
        </div>
      </Card>

      <div className="space-y-10">
        {vehicle.status === 'ready' ? <VehicleSection key={JSON.stringify(vehicleSpec)} ab={vehicle.data} /> : <Loading state={vehicle} />}
        {cabinet.status === 'ready' ? <CabinetSection key={JSON.stringify(cabSpec)} cab={cabinet.data} /> : <Loading state={cabinet} />}
      </div>
    </>
  );
}
