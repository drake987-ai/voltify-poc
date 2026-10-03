import { describe, expect, it } from 'vitest';
import { runTimeline } from '@/eval/timeline';
import { countUpTo, formatClock, frameAt, pairs, seriesOf } from '@/lib/timelineSeries';
import { formatNumber } from '@/lib/format';

const timeline = runTimeline({ scenario: 'severeHeatLoad', seed: 202, brand: 'A', durationS: 600, mode: 'observe' });
const frames = timeline.frames;

describe('timeline series', () => {
  it('has one value per frame in every column, with 16 cell deviations per frame', () => {
    const s = seriesOf(timeline);
    const n = frames.length;
    for (const col of [s.tMin, s.measured, s.trueTemp, s.filtered, s.nominal, s.heat, s.score, s.current, s.sohEst, s.r25]) {
      expect(col).toHaveLength(n);
    }
    expect(s.cellDev).toHaveLength(n);
    expect(s.cellDev.every((row) => row.length === 16)).toBe(true);
  });

  it('measures each cell against the median, so the deviations of a normal pack straddle zero', () => {
    const row = seriesOf(timeline).cellDev[100];
    const sorted = [...row].sort((a, b) => a - b);
    expect(Math.abs((sorted[7] + sorted[8]) / 2)).toBeLessThan(1e-9); // the median deviation is zero by construction
    expect(Math.min(...row)).toBeLessThan(0);
    expect(Math.max(...row)).toBeGreaterThan(0);
  });

  it('is computed once per timeline and reused', () => {
    expect(seriesOf(timeline)).toBe(seriesOf(timeline));
  });

  it('exposes the same temperatures as the frames', () => {
    const s = seriesOf(timeline);
    expect(s.measured[10]).toBe(frames[10].telemetry.coreTemp);
    expect(s.trueTemp[10]).toBe(frames[10].truth.coreTempC);
    expect(s.score[10]).toBe(frames[10].assessment!.risk.score);
    expect(s.tMin[10]).toBeCloseTo(frames[10].tS / 60, 12);
  });
});

describe('looking up what is shown at playback time', () => {
  it('counts frames at or before a time (binary search)', () => {
    expect(countUpTo(frames, -1)).toBe(0);
    expect(countUpTo(frames, frames[0].tS - 0.001)).toBe(0);
    expect(countUpTo(frames, frames[0].tS)).toBe(1);
    expect(countUpTo(frames, frames[9].tS + 2)).toBe(10);
    expect(countUpTo(frames, 1e9)).toBe(frames.length);
    // Agrees with a linear scan everywhere.
    for (const t of [0, 3, 5, 17, 250, 599, 600]) expect(countUpTo(frames, t)).toBe(frames.filter((f) => f.tS <= t).length);
  });

  it('returns the latest frame at or before the time, or null before the first', () => {
    expect(frameAt(frames, 0)).toBeNull();
    expect(frameAt(frames, 12)!.tS).toBe(10);
    expect(frameAt(frames, 1e9)).toBe(frames[frames.length - 1]);
  });

  it('pairs a column with time and skips frames that have no value', () => {
    expect(pairs([0, 1, 2], [10, Number.NaN, 30], 3)).toEqual([
      [0, 10],
      [2, 30],
    ]);
    expect(pairs([0, 1, 2], [10, 20, 30], 2)).toEqual([
      [0, 10],
      [1, 20],
    ]);
  });
});

describe('formatting', () => {
  it('writes a clock as mm:ss', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(185)).toBe('03:05');
    expect(formatClock(2400)).toBe('40:00');
    expect(formatClock(-5)).toBe('00:00');
  });

  it('uses a decimal comma in Vietnamese and a point in English', () => {
    expect(formatNumber(17.34, 'vi', 1)).toBe('17,3');
    expect(formatNumber(17.34, 'en', 1)).toBe('17.3');
    expect(formatNumber(1234.5, 'en', 0)).toBe('1,235');
  });
});
