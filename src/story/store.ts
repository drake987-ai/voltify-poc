import { create } from 'zustand';
import { IDLE, advance, jumpTo, pauseClock, resumeClock, startClock, type StoryClock } from './clock';
import { STORY_STEPS } from './steps';

interface StoryState extends StoryClock {
  /** Changes whenever the story is started or jumped about, so a screen can be set up again even if the step is the same. */
  runId: number;
  start: () => void;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  toggle: () => void;
  next: () => void;
  prev: () => void;
  goTo: (step: number) => void;
  tick: (dtS: number) => void;
}

const clockOf = (s: StoryState): StoryClock => ({ status: s.status, step: s.step, elapsedS: s.elapsedS });

export const useStoryStore = create<StoryState>((set, get) => ({
  ...IDLE,
  runId: 0,
  start: () => set({ ...startClock(), runId: get().runId + 1 }),
  stop: () => set(IDLE),
  pause: () => set(pauseClock(clockOf(get()))),
  resume: () => set(resumeClock(clockOf(get()))),
  toggle: () => {
    const c = clockOf(get());
    set(c.status === 'playing' ? pauseClock(c) : c.status === 'paused' ? resumeClock(c) : { ...startClock(), runId: get().runId + 1 });
  },
  next: () => {
    const c = clockOf(get());
    set(
      c.step >= STORY_STEPS.length - 1
        ? { ...c, status: 'ended', elapsedS: STORY_STEPS[c.step].durationS }
        : { ...jumpTo(c, c.step + 1), runId: get().runId + 1 },
    );
  },
  prev: () => {
    const c = clockOf(get());
    // Within the first few seconds of a step, "previous" goes to the step before; later it restarts this one.
    set({ ...jumpTo(c, c.elapsedS > 3 || c.status === 'ended' ? c.step : c.step - 1), runId: get().runId + 1 });
  },
  goTo: (step) => set({ ...jumpTo(clockOf(get()), step), runId: get().runId + 1 }),
  tick: (dtS) => set(advance(clockOf(get()), dtS)),
}));

/** True while the demo is running or paused (not before it starts or after it ends). */
export const useStoryActive = (): boolean => useStoryStore((s) => s.status === 'playing' || s.status === 'paused');
