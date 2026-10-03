// The story's clock as pure functions: where the demo is, and what a tick, a jump or a pause does to it.
import { STORY_STEPS, STORY_TOTAL_S, stepOffsetS } from './steps';

export type StoryStatus = 'idle' | 'playing' | 'paused' | 'ended';

export interface StoryClock {
  status: StoryStatus;
  /** Index into STORY_STEPS. */
  step: number;
  /** Seconds into the current step. */
  elapsedS: number;
}

export const IDLE: StoryClock = { status: 'idle', step: 0, elapsedS: 0 };

export const startClock = (): StoryClock => ({ status: 'playing', step: 0, elapsedS: 0 });

/** Move the clock forward by `dtS` seconds (only while playing); running past the last step ends the story. */
export function advance(c: StoryClock, dtS: number): StoryClock {
  if (c.status !== 'playing' || dtS <= 0) return c;
  let step = c.step;
  let elapsed = c.elapsedS + dtS;
  while (elapsed >= STORY_STEPS[step].durationS) {
    elapsed -= STORY_STEPS[step].durationS;
    if (step === STORY_STEPS.length - 1) {
      return { status: 'ended', step, elapsedS: STORY_STEPS[step].durationS };
    }
    step++;
  }
  return { status: 'playing', step, elapsedS: elapsed };
}

/** Go to the start of a step (the story plays on from there). */
export function jumpTo(c: StoryClock, step: number): StoryClock {
  const s = Math.min(STORY_STEPS.length - 1, Math.max(0, Math.floor(step)));
  return { status: c.status === 'idle' || c.status === 'ended' ? 'playing' : c.status, step: s, elapsedS: 0 };
}

export const pauseClock = (c: StoryClock): StoryClock => (c.status === 'playing' ? { ...c, status: 'paused' } : c);
export const resumeClock = (c: StoryClock): StoryClock => (c.status === 'paused' ? { ...c, status: 'playing' } : c);

/** Seconds since the start of the story. */
export const totalElapsedS = (c: StoryClock): number => Math.min(STORY_TOTAL_S, stepOffsetS(c.step) + c.elapsedS);
