import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { BRANDS, type Brand } from '@/adapters';
import { Card } from '@/components/ui/Card';
import { PlaybackBar } from '@/components/ui/PlaybackBar';
import type { HubFrame, HubRun } from '@/eval/hub';
import { usePlayback } from '@/hooks/usePlayback';
import { FeedCards } from './FeedCards';
import { FidelityCard } from './FidelityCard';
import { MappingTable } from './MappingTable';
import { PipelineStrip } from './PipelineStrip';
import { TryIt } from './TryIt';
import { UnifiedView } from './UnifiedView';

/** The latest frame at or before `tS`, or null before the first one (frames are in time order). */
function latestFrame(frames: readonly HubFrame[], tS: number): HubFrame | null {
  let lo = 0;
  let hi = frames.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].tS <= tS) lo = mid + 1;
    else hi = mid;
  }
  return lo === 0 ? null : frames[lo - 1];
}

/** The replayable hub for one computed run. */
export function HubView({ run }: { run: HubRun }) {
  const { t } = useTranslation();
  const playback = usePlayback(run.spec.durationS, { autoplay: true, speed: 10 });
  const { tS } = playback;

  const frames = Object.fromEntries(BRANDS.map((b) => [b, latestFrame(run.streams[b].frames, tS)])) as Record<Brand, HubFrame | null>;
  // The sample payloads of the try-it box stay put while the replay runs.
  const samples = useMemo(
    () => Object.fromEntries(BRANDS.map((b) => [b, run.streams[b].frames[1].raw])) as Record<Brand, unknown>,
    [run],
  );

  return (
    <div className="space-y-6">
      <PipelineStrip />

      <PlaybackBar playback={playback} durationS={run.spec.durationS} />
      <p className="-mt-3 text-xs leading-snug text-muted">{t('hub.scenarioNote')}</p>

      <section aria-labelledby="hub-feeds" className="space-y-3">
        <div>
          <h2 id="hub-feeds" className="text-lg font-semibold tracking-tight">
            {t('hub.feeds.title')}
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted">{t('hub.feeds.intro')}</p>
        </div>
        <FeedCards run={run} frames={frames} />
      </section>

      <MappingTable />
      <UnifiedView run={run} frames={frames} tS={tS} />
      <FidelityCard run={run} />
      <TryIt rawByBrand={samples} />

      <Card className="border-accent/40">
        <h2 className="text-base font-semibold">{t('hub.limits.title')}</h2>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted">
          <li>{t('hub.limits.fictional')}</li>
          <li>{t('hub.limits.adapter')}</li>
          <li>{t('hub.limits.moat')}</li>
        </ul>
      </Card>
    </div>
  );
}
