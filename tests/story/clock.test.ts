import { describe, expect, it } from 'vitest';
import { IDLE, advance, jumpTo, pauseClock, resumeClock, startClock, totalElapsedS } from '@/story/clock';
import { BEAT_IDS, STORY_STEPS, STORY_TOTAL_S, beatIndex, stepOffsetS } from '@/story/steps';
import { useStoryStore } from '@/story/store';

describe('the story plan', () => {
  it('lasts three minutes and visits screens 1, 3, 5 and 7 in that order', () => {
    expect(STORY_TOTAL_S).toBe(180);
    expect(STORY_STEPS.map((s) => s.screen)).toEqual([1, 3, 5, 7]);
    expect(STORY_STEPS.map((s) => s.path)).toEqual(['/fleet', '/bms-vs-voltify', '/intervention', '/roi']);
  });

  it('gives every step three captions that start at 0 and arrive in order inside the step', () => {
    for (const s of STORY_STEPS) {
      expect(s.beatAt).toHaveLength(BEAT_IDS.length);
      expect(s.beatAt[0]).toBe(0);
      for (let i = 1; i < s.beatAt.length; i++) expect(s.beatAt[i]).toBeGreaterThan(s.beatAt[i - 1]);
      expect(s.beatAt[s.beatAt.length - 1]).toBeLessThan(s.durationS);
    }
  });

  it('picks the caption that is showing at a given moment of a step', () => {
    const fleet = STORY_STEPS[0];
    expect(beatIndex(0, 0)).toBe(0);
    expect(beatIndex(0, fleet.beatAt[1] - 0.01)).toBe(0);
    expect(beatIndex(0, fleet.beatAt[1])).toBe(1);
    expect(beatIndex(0, fleet.durationS)).toBe(2);
  });

  it('puts each step at the right offset in the whole', () => {
    expect(stepOffsetS(0)).toBe(0);
    expect(stepOffsetS(1)).toBe(40);
    expect(stepOffsetS(2)).toBe(90);
    expect(stepOffsetS(3)).toBe(150);
  });
});

describe('the story clock', () => {
  it('does nothing until started, then runs through every step to the end and stops there', () => {
    expect(advance(IDLE, 5)).toBe(IDLE);
    let c = startClock();
    const seen: number[] = [];
    for (let t = 0; t < 400 && c.status === 'playing'; t += 0.5) {
      c = advance(c, 0.5);
      if (!seen.includes(c.step)) seen.push(c.step);
    }
    expect(seen).toEqual([0, 1, 2, 3]);
    expect(c.status).toBe('ended');
    expect(totalElapsedS(c)).toBe(STORY_TOTAL_S);
    expect(advance(c, 10)).toBe(c);
  });

  it('is the same run every time (no wall clock, no randomness)', () => {
    const run = () => {
      let c = startClock();
      const trace: string[] = [];
      for (let i = 0; i < 400; i++) {
        c = advance(c, 0.5);
        trace.push(`${c.status}:${c.step}:${c.elapsedS}`);
      }
      return trace.join(',');
    };
    expect(run()).toBe(run());
  });

  it('carries a long tick across a step boundary instead of losing time', () => {
    const c = advance(startClock(), STORY_STEPS[0].durationS + 7);
    expect(c.step).toBe(1);
    expect(c.elapsedS).toBeCloseTo(7, 9);
    expect(totalElapsedS(c)).toBeCloseTo(STORY_STEPS[0].durationS + 7, 9);
  });

  it('pauses without losing its place, and resumes from there', () => {
    const c = advance(startClock(), 20);
    const p = pauseClock(c);
    expect(p.status).toBe('paused');
    expect(advance(p, 30)).toBe(p);
    const r = resumeClock(p);
    expect(r).toMatchObject({ status: 'playing', step: c.step, elapsedS: c.elapsedS });
    expect(resumeClock(c)).toBe(c);
  });

  it('jumps to the start of a step, clamped to the plan, and starts playing from idle or the end', () => {
    expect(jumpTo(startClock(), 2)).toMatchObject({ step: 2, elapsedS: 0, status: 'playing' });
    expect(jumpTo(startClock(), 99).step).toBe(STORY_STEPS.length - 1);
    expect(jumpTo(startClock(), -4).step).toBe(0);
    expect(jumpTo(IDLE, 1).status).toBe('playing');
    expect(jumpTo(pauseClock(startClock()), 1).status).toBe('paused');
  });
});

describe('the story store', () => {
  it('starts, steps and stops', () => {
    const s = useStoryStore.getState();
    s.stop();
    expect(useStoryStore.getState().status).toBe('idle');
    useStoryStore.getState().start();
    expect(useStoryStore.getState()).toMatchObject({ status: 'playing', step: 0 });
    useStoryStore.getState().tick(60); // 20 s into the second step
    expect(useStoryStore.getState().step).toBe(1);
    useStoryStore.getState().prev(); // more than 3 s into the step: restarts it
    expect(useStoryStore.getState()).toMatchObject({ step: 1, elapsedS: 0 });
    useStoryStore.getState().prev(); // at its start: the step before
    expect(useStoryStore.getState().step).toBe(0);
    useStoryStore.getState().goTo(3);
    useStoryStore.getState().next(); // past the last step: ended
    expect(useStoryStore.getState().status).toBe('ended');
    useStoryStore.getState().toggle(); // from the end: play again from the start
    expect(useStoryStore.getState()).toMatchObject({ status: 'playing', step: 0, elapsedS: 0 });
    useStoryStore.getState().toggle();
    expect(useStoryStore.getState().status).toBe('paused');
    useStoryStore.getState().stop();
  });
});
