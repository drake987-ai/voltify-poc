import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import type { FleetKpis, FleetSnapshot } from '@/fleet';
import { RISK_LEVELS } from '@/lib/riskLevels';

interface Bin {
  label: string;
  count: number;
  color?: string;
}

function Histogram({ title, bins, note }: { title: string; bins: Bin[]; note?: string }) {
  const max = Math.max(1, ...bins.map((b) => b.count));
  return (
    <Card>
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="mt-3 space-y-1.5">
        {bins.map((b) => (
          <li key={b.label} className="flex items-center gap-2 text-xs">
            <span className="w-20 shrink-0 truncate text-muted">{b.label}</span>
            <span className="h-3 flex-1 overflow-hidden rounded bg-border" role="presentation">
              <span className="block h-full rounded" style={{ width: `${(b.count / max) * 100}%`, background: b.color ?? 'var(--c-accent)' }} />
            </span>
            <span className="w-9 shrink-0 text-right font-semibold">{b.count}</span>
          </li>
        ))}
      </ul>
      {note ? <p className="mt-2 text-[11px] text-muted">{note}</p> : null}
    </Card>
  );
}

const decile = (values: Uint8Array, include: (v: number) => boolean): number[] => {
  const bins = new Array<number>(10).fill(0);
  for (const v of values) if (include(v)) bins[Math.min(9, Math.floor(v / 10))]++;
  return bins;
};

/** The same four vital signs across the whole fleet, as simple distributions. */
export function FleetDistributions({ snapshot, kpis }: { snapshot: FleetSnapshot; kpis: FleetKpis }) {
  const { t } = useTranslation();
  const socBins = decile(snapshot.soc, () => true);
  const perfBins = decile(snapshot.perf, (v) => v > 0);
  const classes = { good: 0, fair: 0, weak: 0, learning: 0 };
  for (const s of snapshot.soh) {
    if (s === 0) classes.learning++;
    else if (s >= 85) classes.good++;
    else if (s >= 75) classes.fair++;
    else classes.weak++;
  }
  const range = (i: number, unit = '') => `${i * 10}–${i === 9 ? 100 : i * 10 + 9}${unit}`;

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Histogram title={t('vitals.fleet.soc')} bins={socBins.map((count, i) => ({ label: range(i, ' %'), count }))} />
      <Histogram
        title={t('vitals.fleet.health')}
        bins={[
          { label: t('twin.readout.sohClass.good').split(':')[0], count: classes.good },
          { label: t('twin.readout.sohClass.fair').split(':')[0], count: classes.fair },
          { label: t('twin.readout.sohClass.weak').split(':')[0], count: classes.weak },
          { label: t('twin.readout.learning'), count: classes.learning, color: 'var(--c-muted)' },
        ]}
      />
      <Histogram
        title={t('vitals.fleet.safety')}
        bins={RISK_LEVELS.map((l, i) => ({
          label: t(`risk.${l}`),
          count: kpis.levelCounts[i],
          color: ['var(--c-risk-safe)', 'var(--c-risk-watch)', 'var(--c-risk-warning)', 'var(--c-risk-danger)'][i],
        }))}
      />
      <Histogram
        title={t('vitals.fleet.discharge')}
        bins={perfBins.map((count, i) => ({ label: range(i), count }))}
        note={t('vitals.fleet.dischargeNote')}
      />
    </div>
  );
}
