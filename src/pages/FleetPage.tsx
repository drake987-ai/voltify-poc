import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BRANDS } from '@/adapters';
import { FleetMap } from '@/components/map/FleetMap';
import type { PointsData } from '@/components/map/PointsLayer';
import { Card } from '@/components/ui/Card';
import { LevelGlyph } from '@/components/ui/LevelGlyph';
import { PageHeader } from '@/components/ui/PageHeader';
import { useFleet } from '@/hooks/useFleet';
import { RISK_LEVELS } from '@/lib/riskLevels';
import type { City } from '@/sim';
import { FleetControls } from '@/pages/fleet/FleetControls';
import { KpiRow, KpiTrace, type KpiId } from '@/pages/fleet/KpiRow';
import { AlertList, SelectedPanel } from '@/pages/fleet/SidePanels';

const chip = (on: boolean) =>
  `rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
    on ? 'border-accent bg-accent/15 text-accent' : 'border-border text-muted hover:text-text'
  }`;

export default function FleetPage() {
  const { t } = useTranslation();
  const fleet = useFleet();
  const { snapshot, layout, controller, selectedId } = fleet;
  const [city, setCity] = useState<City>('hcmc');
  const [brands, setBrands] = useState<ReadonlySet<number>>(new Set([0, 1, 2]));
  const [openKpi, setOpenKpi] = useState<KpiId | null>(null);

  const selectedIndex = selectedId && layout ? layout.ids.indexOf(selectedId) : -1;

  const points = useMemo<PointsData | null>(() => {
    if (!snapshot || !layout) return null;
    const visible = new Uint8Array(layout.n);
    const cityIndex = city === 'hcmc' ? 0 : 1;
    for (let i = 0; i < layout.n; i++) {
      visible[i] = brands.has(layout.brands[i]) && layout.cities[i] === cityIndex ? 1 : 0;
    }
    return { lat: snapshot.lat, lng: snapshot.lng, level: snapshot.level, visible, selected: selectedIndex };
  }, [snapshot, layout, brands, city, selectedIndex]);

  const toggleBrand = (b: number) => {
    const next = new Set(brands);
    if (next.has(b)) next.delete(b);
    else next.add(b);
    setBrands(next.size === 0 ? new Set([0, 1, 2]) : next);
  };

  const pick = (index: number) => {
    if (layout && index >= 0) controller.select(layout.ids[index]);
    else controller.select(null);
  };

  return (
    <>
      <PageHeader page="fleet" dataSource={{ kind: 'simulated' }} />

      <FleetControls state={fleet} controller={controller} />

      {fleet.error ? (
        <Card className="mb-4 text-sm text-risk-danger" role="alert">
          {t('state.error', { message: fleet.error })}
        </Card>
      ) : null}

      <KpiRow kpis={snapshot?.kpis ?? null} total={layout?.n ?? 0} open={openKpi} onToggle={(id) => setOpenKpi(openKpi === id ? null : id)} />
      {openKpi && snapshot ? (
        <div className="mt-3">
          <KpiTrace id={openKpi} kpis={snapshot.kpis} onClose={() => setOpenKpi(null)} />
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="min-w-0 !p-3">
          <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2">
            <div role="group" aria-label={t('fleet.filters.city')} className="flex gap-2">
              {(['hcmc', 'hanoi'] as const).map((c) => (
                <button key={c} type="button" aria-pressed={city === c} onClick={() => setCity(c)} className={chip(city === c)}>
                  {t(c === 'hcmc' ? 'fleet.map.cityHcmc' : 'fleet.map.cityHanoi')}
                </button>
              ))}
            </div>
            <div role="group" aria-label={t('fleet.filters.brand')} className="flex flex-wrap gap-2">
              {BRANDS.map((b, i) => (
                <button key={b} type="button" aria-pressed={brands.has(i)} onClick={() => toggleBrand(i)} className={chip(brands.has(i))}>
                  {t(`brands.${b}`)}
                </button>
              ))}
            </div>
          </div>

          <FleetMap data={points} city={city} onPick={pick} height={520} />

          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted" aria-label={t('fleet.map.legendTitle')}>
            {RISK_LEVELS.map((l, i) => (
              <li key={l} className="flex items-center gap-1.5">
                <LevelGlyph level={i as 0 | 1 | 2 | 3} />
                {t(`risk.${l}`)}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs leading-snug text-muted">{t('fleet.map.note', { n: layout?.n ?? 0 })}</p>
        </Card>

        <div className="min-w-0 space-y-4">
          <SelectedPanel snapshot={snapshot} layout={layout} selectedId={selectedId} onClear={() => controller.select(null)} />
          <AlertList alerts={snapshot?.alerts ?? []} onSelect={(id) => controller.select(id)} />
        </div>
      </div>
    </>
  );
}
