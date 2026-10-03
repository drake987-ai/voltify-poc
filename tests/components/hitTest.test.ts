import { describe, expect, it } from 'vitest';
import { nearestIndex, SHAPE_OF_LEVEL } from '@/components/map/hitTest';

const xs = [10, 12, 100, 300];
const ys = [10, 10, 100, 300];
const all = [1, 1, 1, 1];
const zero = [0, 0, 0, 0];

describe('map point picking', () => {
  it('picks the nearest point within range and nothing outside it', () => {
    expect(nearestIndex(xs, ys, all, zero, 99, 101, 14)).toBe(2);
    expect(nearestIndex(xs, ys, all, zero, 200, 200, 14)).toBe(-1);
    expect(nearestIndex([], [], [], [], 0, 0, 14)).toBe(-1);
  });

  it('ignores points filtered out', () => {
    expect(nearestIndex(xs, ys, [1, 0, 1, 1], zero, 12, 10, 14)).toBe(0);
    expect(nearestIndex(xs, ys, [0, 0, 0, 0], zero, 10, 10, 14)).toBe(-1);
  });

  it('prefers the riskier pack when two overlap', () => {
    // Points 0 and 1 are 2 px apart; the click is a touch nearer to point 1.
    expect(nearestIndex(xs, ys, all, zero, 11.4, 10, 14)).toBe(1);
    expect(nearestIndex(xs, ys, all, [0, 3, 0, 0], 10.4, 10, 14)).toBe(1); // danger beats a slightly closer safe one
    expect(nearestIndex(xs, ys, all, [3, 0, 0, 0], 11.4, 10, 14)).toBe(0);
  });

  it('uses a different shape for every risk level, so level never depends on colour alone', () => {
    expect(SHAPE_OF_LEVEL).toHaveLength(4);
    expect(new Set(SHAPE_OF_LEVEL).size).toBe(4);
  });
});
