// What the story does to the screens besides showing them: start from the same place every time
// (so the demo repeats), and point at something at the moments that call for it.
import { DEFAULT_FLEET_CONFIG } from '../fleet/plan';
import { fleetController } from '../workers/fleetClient';
import type { StoryBeatId, StoryStepId } from './steps';

/** The pack with the highest Risk Score right now, or null while the fleet has not started. */
export function topRiskId(): string | null {
  const { snapshot, layout } = fleetController.getState();
  if (!snapshot || !layout) return null;
  let best = -1;
  let bestScore = -Infinity;
  for (let i = 0; i < layout.n; i++) {
    if (snapshot.score[i] > bestScore) {
      bestScore = snapshot.score[i];
      best = i;
    }
  }
  return best >= 0 ? layout.ids[best] : null;
}

/** Called when a step is entered (including re-entering it): put the screen in its starting state. */
export function prepareStep(id: StoryStepId): void {
  if (id === 'fleet') {
    // The default fleet from the beginning, at 60x: same seed, so the same story every time.
    fleetController.configure(DEFAULT_FLEET_CONFIG);
    fleetController.setSpeed(60);
    fleetController.play();
  }
}

/** Called when a caption comes up. */
export function runBeat(id: StoryStepId, beat: StoryBeatId): void {
  if (id === 'fleet' && beat === 'b2') {
    const top = topRiskId();
    if (top) fleetController.select(top);
  }
}
