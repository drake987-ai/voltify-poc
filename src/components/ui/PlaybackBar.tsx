import { Pause, Play, RotateCcw, SkipForward } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Playback } from '@/hooks/usePlayback';
import { formatClock } from '@/lib/timelineSeries';

/** Play / pause / replay, 1x-10x-60x speed, and a scrubber over the simulated run. */
export function PlaybackBar({ playback, durationS }: { playback: Playback; durationS: number }) {
  const { t } = useTranslation();
  const { tS, playing, speed } = playback;
  const button =
    'inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm font-medium text-text transition-colors hover:border-accent hover:text-accent';

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border bg-surface p-3">
      <div className="flex items-center gap-2">
        <button type="button" onClick={playback.toggle} className={button} aria-label={playing ? t('playback.pause') : t('playback.play')}>
          {playing ? <Pause aria-hidden className="size-4" /> : <Play aria-hidden className="size-4" />}
          {playing ? t('playback.pause') : t('playback.play')}
        </button>
        <button type="button" onClick={playback.replay} className={button}>
          <RotateCcw aria-hidden className="size-4" />
          {t('playback.replay')}
        </button>
        <button type="button" onClick={playback.toEnd} className={button}>
          <SkipForward aria-hidden className="size-4" />
          {t('playback.toEnd')}
        </button>
      </div>

      <div role="group" aria-label={t('playback.speed')} className="inline-flex rounded-lg border border-border bg-surface-2 p-0.5 text-xs font-semibold">
        {playback.speeds.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={speed === s}
            onClick={() => playback.setSpeed(s)}
            className={`rounded-md px-2.5 py-1 transition-colors ${speed === s ? 'bg-accent text-accent-fg' : 'text-muted hover:text-text'}`}
          >
            {s}×
          </button>
        ))}
      </div>

      <label className="flex min-w-48 flex-1 items-center gap-3 text-sm text-muted">
        <span className="sr-only">{t('playback.scrub')}</span>
        <input
          type="range"
          min={0}
          max={durationS}
          step={5}
          value={tS}
          onChange={(e) => playback.seek(Number(e.target.value))}
          className="h-1.5 flex-1 cursor-pointer accent-[var(--c-accent)]"
        />
        <span className="w-28 shrink-0 text-right font-medium text-text">
          {formatClock(tS)} / {formatClock(durationS)}
        </span>
      </label>
    </div>
  );
}
