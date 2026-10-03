// Story Mode (CLAUDE.md section 6, screen 10): a 3-minute guided demo that walks through screens
// 1 -> 3 -> 5 -> 7 by itself. Each step shows one real screen for a fixed time while three captions
// follow one another. The durations add up to 180 seconds. The timing follows the screens: the
// BMS-vs-Voltify replay plays at 60x (its trip comes about 20 s in) and the intervention replay at 10x
// (the alert comes about 20 s in, the swap about 49 s in, so its last caption waits until 50 s).
export const STORY_STEPS = [
  { id: 'fleet', screen: 1, path: '/fleet', durationS: 40, beatAt: [0, 13, 27] },
  { id: 'bms', screen: 3, path: '/bms-vs-voltify', durationS: 50, beatAt: [0, 12, 28] },
  { id: 'intervention', screen: 5, path: '/intervention', durationS: 60, beatAt: [0, 20, 50] },
  { id: 'roi', screen: 7, path: '/roi', durationS: 30, beatAt: [0, 10, 20] },
] as const;

export type StoryStepId = (typeof STORY_STEPS)[number]['id'];
export type StoryBeatId = 'b1' | 'b2' | 'b3';
export const BEAT_IDS: readonly StoryBeatId[] = ['b1', 'b2', 'b3'];

export const STORY_TOTAL_S = STORY_STEPS.reduce((s, x) => s + x.durationS, 0);

/** Seconds from the start of the story to the start of step `i`. */
export const stepOffsetS = (i: number): number => STORY_STEPS.slice(0, i).reduce((s, x) => s + x.durationS, 0);

/** Which of the step's three captions is showing `elapsedS` seconds into the step. */
export function beatIndex(step: number, elapsedS: number): 0 | 1 | 2 {
  const at = STORY_STEPS[step].beatAt;
  let idx = 0;
  for (let i = 0; i < at.length; i++) if (elapsedS >= at[i]) idx = i;
  return idx as 0 | 1 | 2;
}
