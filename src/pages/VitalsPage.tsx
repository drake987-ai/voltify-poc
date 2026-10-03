import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { useFleet } from '@/hooks/useFleet';
import { FleetDistributions } from '@/pages/vitals/FleetDistributions';
import { VitalCards } from '@/pages/vitals/VitalCards';

/** How many of the riskiest batteries to offer in the picker, besides the one already chosen. */
const PICKER_SIZE = 14;

export default function VitalsPage() {
  const { t } = useTranslation();
  const { batteryId } = useParams<{ batteryId: string }>();
  const { snapshot, layout, controller, selectedId } = useFleet();

  // A link from another screen (/vitals/A-0012) chooses the battery.
  useEffect(() => {
    if (batteryId && batteryId !== selectedId) controller.select(batteryId);
  }, [batteryId]);

  // With nothing chosen yet, start from the pack with the highest Risk Score.
  const riskiest = useMemo(() => {
    if (!snapshot || !layout) return [];
    return Array.from({ length: layout.n }, (_, i) => i)
      .sort((a, b) => snapshot.score[b] - snapshot.score[a])
      .slice(0, PICKER_SIZE);
  }, [snapshot, layout]);

  useEffect(() => {
    if (!selectedId && !batteryId && layout && riskiest.length > 0) controller.select(layout.ids[riskiest[0]]);
  }, [selectedId, batteryId, layout, riskiest.length > 0]);

  const options = useMemo(() => {
    if (!snapshot || !layout) return [];
    const ids = riskiest.map((i) => layout.ids[i]);
    if (selectedId && !ids.includes(selectedId)) ids.unshift(selectedId);
    return ids.map((id) => ({
      value: id,
      label: `#${id} · ${t('twin.risk.title')} ${snapshot.score[layout.ids.indexOf(id)]}`,
    }));
  }, [snapshot, layout, riskiest, selectedId, t]);

  const detail = snapshot?.selected ?? null;

  return (
    <>
      <PageHeader page="vitals" dataSource={{ kind: 'simulated' }} />

      <Card className="mb-4">
        <div className="grid gap-3 md:grid-cols-[minmax(0,320px)_minmax(0,1fr)] md:items-end">
          <Select
            label={t('vitals.controls.battery')}
            value={selectedId ?? ''}
            onChange={(id) => controller.select(id)}
            options={options.length > 0 ? options : [{ value: '', label: t('state.loadingFleet') }]}
          />
          <p className="text-sm leading-relaxed text-muted">{t('vitals.controls.hint')}</p>
        </div>
      </Card>

      {detail ? (
        <VitalCards detail={detail} />
      ) : (
        <Card className="text-sm text-muted" aria-busy="true">
          {t('state.loadingFleet')}
        </Card>
      )}

      {snapshot ? (
        <section className="mt-6" aria-label={t('vitals.fleet.title')}>
          <h2 className="mb-3 text-base font-semibold">{t('vitals.fleet.title')}</h2>
          <FleetDistributions snapshot={snapshot} kpis={snapshot.kpis} />
        </section>
      ) : null}
    </>
  );
}
