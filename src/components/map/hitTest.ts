/** Pure helpers for choosing a point on the map, kept apart from Leaflet so they can be tested. */

export interface ScreenPoint {
  x: number;
  y: number;
}

/**
 * Index of the point nearest to (px, py) within `maxDist` pixels, or -1. Points with a higher
 * `priority` win when two are about as close (a danger pack hidden under a safe one is the one to pick).
 */
export function nearestIndex(
  xs: ArrayLike<number>,
  ys: ArrayLike<number>,
  visible: ArrayLike<number>,
  priority: ArrayLike<number>,
  px: number,
  py: number,
  maxDist: number,
): number {
  let best = -1;
  let bestScore = Infinity;
  const limit = maxDist * maxDist;
  for (let i = 0; i < xs.length; i++) {
    if (!visible[i]) continue;
    const dx = xs[i] - px;
    const dy = ys[i] - py;
    const d2 = dx * dx + dy * dy;
    if (d2 > limit) continue;
    // A higher priority is worth up to 6 px of extra distance.
    const score = Math.sqrt(d2) - priority[i] * 2;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

export type Shape = 'dot' | 'ring' | 'triangle' | 'diamond';

/** One distinct shape per risk level, so the level can be read without colour. */
export const SHAPE_OF_LEVEL: readonly Shape[] = ['dot', 'ring', 'triangle', 'diamond'];
