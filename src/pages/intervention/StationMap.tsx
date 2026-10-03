import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { stationsFor } from '@/intervention';
import type { City } from '@/sim';
import type { PhoneState } from './phoneState';

const W = 256;
const H = 170;
const PAD = 22;

/**
 * A schematic map for the phone: the shipper, the station they were sent to (with the cool
 * pack held for them) and the other stations nearby. Straight lines, no street network:
 * it is the route the simulation assumes, not a navigation map.
 */
export function StationMap({ city, state }: { city: City; state: PhoneState }) {
  const { t } = useTranslation();
  const { start, position, station } = state;

  const view = useMemo(() => {
    if (!start || !station) return null;
    const cosLat = Math.cos((start.lat * Math.PI) / 180);
    const xs = [start.lng * cosLat, station.lng * cosLat];
    const ys = [start.lat, station.lat];
    // At least a few hundred metres wide so a very near station does not zoom in absurdly far.
    const minSpan = 0.004;
    const spanX = Math.max(Math.max(...xs) - Math.min(...xs), minSpan);
    const spanY = Math.max(Math.max(...ys) - Math.min(...ys), minSpan);
    const scale = Math.min((W - 2 * PAD) / spanX, (H - 2 * PAD) / spanY);
    const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
    const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
    const project = (lat: number, lng: number) => ({
      x: W / 2 + (lng * cosLat - cx) * scale,
      y: H / 2 - (lat - cy) * scale,
    });
    return { project, cosLat };
  }, [start, station]);

  if (!view || !start || !station || !position) return <div className="h-[170px]" aria-hidden />;

  const { project } = view;
  const p0 = project(start.lat, start.lng);
  const p1 = project(station.lat, station.lng);
  const pn = project(position.lat, position.lng);
  const others = stationsFor(city)
    .filter((s) => s.id !== station.id)
    .map((s) => ({ s, ...project(s.lat, s.lng) }))
    .filter((o) => o.x > 4 && o.x < W - 4 && o.y > 4 && o.y < H - 4);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('intervention.phone.mapAria')} className="w-full rounded-lg bg-slate-100">
      <g stroke="#cbd5e1" strokeWidth="1">
        {[0.25, 0.5, 0.75].map((f) => (
          <g key={f}>
            <line x1={W * f} y1={0} x2={W * f} y2={H} />
            <line x1={0} y1={H * f} x2={W} y2={H * f} />
          </g>
        ))}
      </g>
      {others.map((o) => (
        <circle key={o.s.id} cx={o.x} cy={o.y} r={3} fill={o.s.coolPacks > 0 ? '#94a3b8' : 'none'} stroke="#94a3b8" strokeWidth="1" />
      ))}
      <line x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} stroke="#64748b" strokeWidth="2" strokeDasharray="5 4" />
      <line x1={p0.x} y1={p0.y} x2={pn.x} y2={pn.y} stroke="#059669" strokeWidth="3" strokeLinecap="round" />
      {/* Station: a square (shape, not just colour) with the id next to it. */}
      <rect x={p1.x - 8} y={p1.y - 8} width={16} height={16} rx={3} fill="#059669" stroke="#fff" strokeWidth="2" />
      <path d={`M${p1.x + 1} ${p1.y - 5} L${p1.x - 3} ${p1.y + 1} H${p1.x} L${p1.x - 1} ${p1.y + 5} L${p1.x + 3} ${p1.y - 1} H${p1.x}Z`} fill="#fff" />
      <text x={p1.x} y={p1.y - 13} textAnchor="middle" fontSize="10" fontWeight="700" fill="#065f46" stroke="#f1f5f9" strokeWidth="3" paintOrder="stroke">
        {station.id}
      </text>
      <circle cx={pn.x} cy={pn.y} r={7} fill="#2563eb" stroke="#fff" strokeWidth="2.5" />
    </svg>
  );
}
