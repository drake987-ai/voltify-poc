import { useCallback, useEffect, useRef, useState } from 'react';

export const PLAYBACK_SPEEDS = [1, 10, 60] as const;
export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];

export interface Playback {
  /** Simulated seconds shown so far. */
  tS: number;
  playing: boolean;
  speed: PlaybackSpeed;
  atEnd: boolean;
  setSpeed: (s: PlaybackSpeed) => void;
  toggle: () => void;
  seek: (tS: number) => void;
  /** Start again from zero and play (the run is deterministic, so it replays identically). */
  replay: () => void;
  toEnd: () => void;
}

/**
 * Plays back a precomputed simulation at 1x, 10x or 60x of real time. The state is
 * published at about 20 Hz, which is smooth enough for charts without re-rendering
 * them every frame.
 */
export function usePlayback(durationS: number, options: { autoplay?: boolean; speed?: PlaybackSpeed } = {}): Playback {
  const [tS, setT] = useState(0);
  const [playing, setPlaying] = useState(options.autoplay ?? false);
  const [speed, setSpeed] = useState<PlaybackSpeed>(options.speed ?? 60);
  const tRef = useRef(0);
  const lastWall = useRef(0);
  const lastPublish = useRef(0);

  const publish = useCallback((t: number) => {
    tRef.current = t;
    setT(t);
  }, []);

  // A new run (different duration) starts over.
  useEffect(() => {
    publish(0);
    setPlaying(options.autoplay ?? false);
  }, [durationS]);

  useEffect(() => {
    if (!playing || durationS <= 0) return;
    let frame = 0;
    lastWall.current = performance.now();
    const tick = (now: number) => {
      const dt = (now - lastWall.current) / 1000;
      lastWall.current = now;
      const next = Math.min(durationS, tRef.current + dt * speed);
      tRef.current = next;
      if (now - lastPublish.current >= 50 || next >= durationS) {
        lastPublish.current = now;
        setT(next);
      }
      if (next >= durationS) setPlaying(false);
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, speed, durationS]);

  const atEnd = durationS > 0 && tS >= durationS;

  return {
    tS,
    playing,
    speed,
    atEnd,
    setSpeed,
    toggle: () => {
      if (atEnd) {
        publish(0);
        setPlaying(true);
      } else setPlaying((p) => !p);
    },
    seek: (t) => publish(Math.max(0, Math.min(durationS, t))),
    replay: () => {
      publish(0);
      setPlaying(true);
    },
    toEnd: () => {
      publish(durationS);
      setPlaying(false);
    },
  };
}
