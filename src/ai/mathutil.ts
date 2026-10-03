export const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);

/** 0 at or below `lo`, 1 at or above `hi`, linear in between. */
export const ramp = (x: number, lo: number, hi: number): number => clamp((x - lo) / (hi - lo), 0, 1);

/** Linear interpolation through (x, y) points sorted by x; clamps outside the range. */
export function interpolate(points: readonly (readonly [number, number])[], x: number): number {
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i];
    if (x <= x1) {
      const [x0, y0] = points[i - 1];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return points[points.length - 1][1];
}

/** Exponential-smoothing weight for a step of `dtS` with time constant `tauS`. */
export const smoothingWeight = (dtS: number, tauS: number): number => 1 - Math.exp(-dtS / tauS);

const scratchA = new Float64Array(64);
const scratchB = new Float64Array(64);

/** Median of the first `n` entries (n <= 64) without modifying `values`. */
export function median(values: ArrayLike<number>, n: number): number {
  const s = scratchA.subarray(0, n);
  for (let i = 0; i < n; i++) s[i] = values[i];
  s.sort();
  return n % 2 === 1 ? s[(n - 1) / 2] : 0.5 * (s[n / 2 - 1] + s[n / 2]);
}

/** Median and robust sigma (1.4826 * MAD) of the first `n` entries. */
export function robustCentre(values: ArrayLike<number>, n: number): { median: number; sigma: number } {
  const med = median(values, n);
  const d = scratchB.subarray(0, n);
  for (let i = 0; i < n; i++) d[i] = Math.abs(values[i] - med);
  d.sort();
  const mad = n % 2 === 1 ? d[(n - 1) / 2] : 0.5 * (d[n / 2 - 1] + d[n / 2]);
  return { median: med, sigma: 1.4826 * mad };
}
