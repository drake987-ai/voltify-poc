import { Pause, Play, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Select } from '@/components/ui/Select';
import { formatClock } from '@/lib/timelineSeries';
import { formatNumber } from '@/lib/format';
import { FLEET_SPEEDS, type FleetSpeed } from '@/fleet/runner';
import type { FleetViewState } from '@/workers/fleetClient';

type Controller = {
  play: () => void;
  pause: () => void;
  reset: () => void;
  setSpeed: (s: FleetSpeed) => void;
  configure: (c: FleetViewState['config']) => void;
};

const SIZES = ['300', '2000'] as const;

/** Play / pause / reset, 1x-10x-60x, fleet size and the simulated clock of the live fleet. */
export function FleetControls({ state, controller }: { state: FleetViewState; controller: Controller }) {
  const { t, i18n } = useTranslation();
  const { playing, speed, snapshot, config } = state;
  const lang = i18n.resolvedLanguage ?? 'vi';
  const button =
    'inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm font-medium text-text transition-colors hover:border-accent hover:text-accent';

  return (
    <div className="mb-4 flex flex-wrap items-end gap-x-5 gap-y-3 rounded-xl border border-border bg-surface p-3">
      <div className="flex items-center gap-2">
        <button type="button" className={button} onClick={playing ? controller.pause : controller.play}>
          {playing ? <Pause aria-hidden className="size-4" /> : <Play aria-hidden className="size-4" />}
          {playing ? t('playback.pause') : t('playback.play')}
        </button>
        <button type="button" className={button} onClick={controller.reset}>
          <RotateCcw aria-hidden className="size-4" />
          {t('fleet.controls.reset')}
        </button>
      </div>

      <div role="group" aria-label={t('playback.speed')} className="inline-flex rounded-lg border border-border bg-surface-2 p-0.5 text-xs font-semibold">
        {FLEET_SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={speed === s}
            onClick={() => controller.setSpeed(s)}
            className={`rounded-md px-2.5 py-1 transition-colors ${speed === s ? 'bg-accent text-accent-fg' : 'text-muted hover:text-text'}`}
          >
            {s}×
          </button>
        ))}
      </div>

      <div className="w-56">
        <Select
          label={t('fleet.controls.size')}
          value={String(config.n) as (typeof SIZES)[number]}
          onChange={(v) => controller.configure({ ...config, n: Number(v) })}
          options={SIZES.map((s) => ({ value: s, label: t(`fleet.controls.sizes.${s}`) }))}
        />
      </div>

      <div className="ml-auto text-right">
        <p className="text-xs font-medium text-muted">{t('fleet.controls.clock')}</p>
        <p className="text-2xl font-semibold tracking-tight">{snapshot ? formatClock(snapshot.tS) : '—'}</p>
        <p className="text-xs text-muted">
          {playing && state.effectiveSpeed > 0
            ? t('fleet.controls.effective', { speed: formatNumber(state.effectiveSpeed, lang, 0) })
            : t('fleet.controls.paused')}
          {' · '}
          {t('fleet.controls.seed', { seed: config.seed })}
        </p>
      </div>
    </div>
  );
}
