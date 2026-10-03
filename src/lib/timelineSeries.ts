// Turn a Timeline (frames) into column arrays for charts, once per timeline, and
// look up "what is shown at playback time t".
import type { Timeline, TimelineFrame } from '../eval/timeline';

export interface TimelineSeries {
  /** Minutes since the start, one entry per frame. */
  tMin: number[];
  measured: number[];
  trueTemp: number[];
  filtered: number[];
  nominal: number[];
  heat: number[];
  trueHeat: number[];
  score: number[];
  contributions: { thermal: number[]; voltage: number[]; overload: number[]; health: number[] };
  current: number[];
  sohEst: number[];
  sohTrue: number[];
  r25: number[];
  /** Per frame, each cell's deviation from the median cell voltage, mV. */
  cellDev: number[][];
}

const cache = new WeakMap<Timeline, TimelineSeries>();

function medianOf(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 === 1 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

export function seriesOf(timeline: Timeline): TimelineSeries {
  const hit = cache.get(timeline);
  if (hit) return hit;
  const f = timeline.frames;
  const pick = (get: (x: TimelineFrame) => number) => f.map(get);
  const ai = (get: (a: NonNullable<TimelineFrame['assessment']>) => number) =>
    f.map((x) => (x.assessment ? get(x.assessment) : Number.NaN));
  const out: TimelineSeries = {
    tMin: pick((x) => x.tS / 60),
    measured: pick((x) => x.telemetry.coreTemp),
    trueTemp: pick((x) => x.truth.coreTempC),
    filtered: ai((a) => a.thermal.tempC),
    nominal: ai((a) => a.thermal.nominalTempC),
    heat: ai((a) => a.thermal.unexplainedHeatW),
    trueHeat: pick((x) => x.truth.qFaultW),
    score: ai((a) => a.risk.score),
    contributions: {
      thermal: ai((a) => a.risk.contributions.thermal),
      voltage: ai((a) => a.risk.contributions.voltage),
      overload: ai((a) => a.risk.contributions.overload),
      health: ai((a) => a.risk.contributions.health),
    },
    current: pick((x) => x.telemetry.current),
    sohEst: ai((a) => a.impedance.sohEst * 100),
    sohTrue: pick((x) => x.truth.soh * 100),
    r25: ai((a) => a.impedance.r25mOhm),
    cellDev: f.map((x) => {
      const v = x.telemetry.cellVoltages;
      const med = medianOf(v);
      return v.map((c) => (c - med) * 1000);
    }),
  };
  cache.set(timeline, out);
  return out;
}

/** Number of frames at or before simulated time `tS` (binary search). */
export function countUpTo(frames: readonly TimelineFrame[], tS: number): number {
  let lo = 0;
  let hi = frames.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].tS <= tS) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** The latest frame at or before `tS`, or null before the first one. */
export function frameAt(frames: readonly TimelineFrame[], tS: number): TimelineFrame | null {
  const n = countUpTo(frames, tS);
  return n === 0 ? null : frames[n - 1];
}

/** Pair a column with the time axis, up to `count` frames, skipping NaN (frames with no AI value). */
export function pairs(tMin: readonly number[], values: readonly number[], count: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < count; i++) if (!Number.isNaN(values[i])) out.push([tMin[i], values[i]]);
  return out;
}

export const formatClock = (tS: number): string => {
  const s = Math.max(0, Math.round(tS));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
