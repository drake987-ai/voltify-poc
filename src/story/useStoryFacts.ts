import { useEffect, useState } from 'react';
import { cabinetSpec } from '@/pages/intervention/config';
import { abSpec } from '@/pages/ab/abConfig';
import { measurePreventionAsync, runABAsync, runCabinetAsync } from '@/workers/client';
import { abFacts, roiFacts, type StoryNumbers } from './facts';

/**
 * Starts the runs the captions quote as soon as the story is active, so the figures are ready by the
 * time their step comes (the runs are cached and shared with the screens themselves).
 */
export function useStoryNumbers(active: boolean): StoryNumbers {
  const [numbers, setNumbers] = useState<StoryNumbers>({ ab: null, roi: null });

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    runABAsync(abSpec('severeHeatLoad', 'A', 'full')).then(
      (ab) => !cancelled && setNumbers((n) => ({ ...n, ab: abFacts(ab) })),
      () => undefined,
    );
    Promise.all([runCabinetAsync(cabinetSpec('A')), measurePreventionAsync()]).then(
      ([cabinet, prevention]) => !cancelled && setNumbers((n) => ({ ...n, roi: roiFacts(cabinet, prevention) })),
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [active]);

  return numbers;
}
