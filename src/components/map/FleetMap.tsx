import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useChartColors } from '@/components/charts/useChartColors';
import { CITY_BOX, type City } from '@/sim';
import { PointsLayer, type LevelColors, type PointsData } from './PointsLayer';

const CITY_VIEW: Record<City, { center: [number, number]; zoom: number }> = {
  hcmc: { center: [(CITY_BOX.hcmc.latMin + CITY_BOX.hcmc.latMax) / 2, (CITY_BOX.hcmc.lngMin + CITY_BOX.hcmc.lngMax) / 2], zoom: 12 },
  hanoi: { center: [(CITY_BOX.hanoi.latMin + CITY_BOX.hanoi.latMax) / 2, (CITY_BOX.hanoi.lngMin + CITY_BOX.hanoi.lngMax) / 2], zoom: 12 },
};

/**
 * OpenStreetMap's standard tiles by default. A build can point `VITE_TILE_URL` somewhere else (a tile server of
 * its own, or an unreachable address to rehearse the offline fallback).
 */
const TILE_URL: string = import.meta.env.VITE_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
/** This many failed tile requests with none loaded means we are offline. */
const OFFLINE_AFTER_ERRORS = 4;

interface FleetMapProps {
  data: PointsData | null;
  city: City;
  onPick: (index: number) => void;
  height: number;
}

/** Leaflet + OpenStreetMap tiles, falling back to a plain grid when tiles cannot be fetched (offline demo). */
export function FleetMap({ data, city, onPick, height }: FleetMapProps) {
  const { t } = useTranslation();
  const colors = useChartColors();
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<PointsLayer | null>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const [offline, setOffline] = useState(false);

  const levelColors: LevelColors = {
    levels: [colors.safe, colors.watch, colors.warning, colors.danger],
    ring: colors.text,
    grid: colors.muted,
    label: colors.text,
  };

  // Create the map once.
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const m = L.map(el, { zoomControl: true, attributionControl: true, preferCanvas: true }).setView(
      CITY_VIEW.hcmc.center,
      CITY_VIEW.hcmc.zoom,
    );
    const tiles = L.tileLayer(TILE_URL, {
      maxZoom: 18,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(m);
    let errors = 0;
    let loaded = 0;
    tiles.on('tileload', () => {
      loaded++;
    });
    tiles.on('tileerror', () => {
      errors++;
      if (loaded === 0 && errors >= OFFLINE_AFTER_ERRORS) {
        m.removeLayer(tiles);
        setOffline(true);
      }
    });
    const pts = new PointsLayer(m, levelColors, (i) => onPickRef.current(i));
    map.current = m;
    layer.current = pts;
    const observer = new ResizeObserver(() => m.invalidateSize());
    observer.observe(el);
    return () => {
      observer.disconnect();
      pts.destroy();
      m.remove();
      map.current = null;
      layer.current = null;
    };
    // The map is created once; colours and data are pushed in by the effects below.
  }, []);

  useEffect(() => {
    layer.current?.setColors(levelColors);
  }, [colors]);

  useEffect(() => {
    layer.current?.setOffline(offline, { hcmc: t('fleet.map.cityHcmc'), hanoi: t('fleet.map.cityHanoi') });
  }, [offline, t]);

  useEffect(() => {
    if (data) layer.current?.update(data);
  }, [data]);

  useEffect(() => {
    map.current?.flyTo(CITY_VIEW[city].center, CITY_VIEW[city].zoom, { duration: 0.8 });
  }, [city]);

  return (
    <div className="relative overflow-hidden rounded-xl border border-border" style={{ height }}>
      <div ref={host} className="fleet-map h-full w-full bg-surface-2" role="application" aria-label={t('fleet.map.aria')} />
      {offline ? (
        <p className="pointer-events-none absolute bottom-2 left-2 z-[500] rounded-md border border-border bg-surface/90 px-2 py-1 text-xs text-muted">
          {t('fleet.map.offline')}
        </p>
      ) : null}
    </div>
  );
}
