// The SOH module on real cells. The module turns resistance into State of Health with one law,
// R / R_new = 1 + gamma (1 - SOH), and the simulator sets gamma = 4. Real cells need not agree. This tests
// the law on the public NASA PCoE cells, where the true SOH is the measured capacity and the resistance
// is the impedance (Re + Rct) measured along the way:
//   1. with the module's own gamma, untouched;
//   2. with a gamma fitted on the OTHER three cells (leave one out), so the cell is judged out of sample;
//   3. against the plainest guess, "the cell is still new" (SOH = 100 %).
// It tests the resistance-to-SOH law, not the online RLS estimator, which needs pack telemetry with current steps.
import { AGE_GAMMA, sohFromTheta } from '../ai';
import { PCOE_CELLS, PCOE_DATA, type PcoeCell, type PcoeCellData } from '../data/nasaPcoe';

export interface RealSohPoint {
  /** Discharge cycle at which the impedance was measured. */
  cycle: number;
  /** True SOH: capacity over the cell's first measured capacity. */
  soh: number;
  /** Resistance (Re + Rct) over the cell's starting resistance. */
  ratio: number;
}

export interface RealCellSummary {
  cell: PcoeCell;
  discharges: number;
  impedanceCount: number;
  /** First and last measured capacity, Ah. */
  cap0Ah: number;
  capEndAh: number;
  /** Capacity lost by the end, percent. */
  fadePct: number;
  /** Resistance at the end over the starting resistance (mean of the last three measurements). */
  ratioEnd: number;
  /** The ageing constant that best fits this cell alone (least squares through the origin), and how well. */
  gammaOwn: number;
  r2Own: number;
  /** The same constant fitted on the other three cells. */
  gammaOthers: number;
  /** Mean absolute SOH error in percentage points, over this cell's impedance measurements. */
  maeModulePp: number;
  maeOthersPp: number;
  maeBaselinePp: number;
}

export interface RealSohResult {
  /** The module's own ageing constant. */
  moduleGamma: number;
  cells: RealCellSummary[];
  points: Record<PcoeCell, RealSohPoint[]>;
  /** [cycle, SOH] of every discharge, from capacity. */
  capacitySoh: Record<PcoeCell, [number, number][]>;
}

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

/** Least-squares gamma through the origin for (ratio - 1) = gamma (1 - soh). */
export function fitGamma(points: readonly RealSohPoint[]): number {
  let num = 0;
  let den = 0;
  for (const p of points) {
    const x = 1 - p.soh;
    num += x * (p.ratio - 1);
    den += x * x;
  }
  return den > 0 ? num / den : Number.NaN;
}

/** The module's estimate for a point, with the given ageing constant. */
export const estimateSoh = (p: RealSohPoint, gamma: number): number => sohFromTheta(p.ratio, gamma);

const maePp = (points: readonly RealSohPoint[], gamma: number) =>
  mean(points.map((p) => Math.abs(estimateSoh(p, gamma) - p.soh))) * 100;

function pointsOf(cell: PcoeCellData): RealSohPoint[] {
  const cap0 = cell.capacity[0][1];
  const r0 = mean(cell.impedance.slice(0, 3).map((i) => i[2] + i[3]));
  return cell.impedance.map(([cycle, cap, re, rct]) => ({ cycle, soh: cap / cap0, ratio: (re + rct) / r0 }));
}

export function analyseRealSoh(data: Record<PcoeCell, PcoeCellData> = PCOE_DATA): RealSohResult {
  const points = Object.fromEntries(PCOE_CELLS.map((c) => [c, pointsOf(data[c])])) as Record<PcoeCell, RealSohPoint[]>;
  const capacitySoh = Object.fromEntries(
    PCOE_CELLS.map((c) => [c, data[c].capacity.map(([n, cap]) => [n, cap / data[c].capacity[0][1]] as [number, number])]),
  ) as Record<PcoeCell, [number, number][]>;

  const cells: RealCellSummary[] = PCOE_CELLS.map((cell) => {
    const mine = points[cell];
    const others = PCOE_CELLS.filter((c) => c !== cell).flatMap((c) => points[c]);
    const gammaOwn = fitGamma(mine);
    const gammaOthers = fitGamma(others);
    // R^2 of the through-origin fit, against the mean of (ratio - 1).
    const my = mean(mine.map((p) => p.ratio - 1));
    let ssr = 0;
    let sst = 0;
    for (const p of mine) {
      ssr += (p.ratio - 1 - gammaOwn * (1 - p.soh)) ** 2;
      sst += (p.ratio - 1 - my) ** 2;
    }
    const caps = data[cell].capacity;
    const last3 = mine.slice(-3);
    return {
      cell,
      discharges: caps.length,
      impedanceCount: mine.length,
      cap0Ah: caps[0][1],
      capEndAh: caps[caps.length - 1][1],
      fadePct: (1 - caps[caps.length - 1][1] / caps[0][1]) * 100,
      ratioEnd: mean(last3.map((p) => p.ratio)),
      gammaOwn,
      r2Own: sst > 0 ? 1 - ssr / sst : Number.NaN,
      gammaOthers,
      maeModulePp: maePp(mine, AGE_GAMMA),
      maeOthersPp: maePp(mine, gammaOthers),
      maeBaselinePp: mean(mine.map((p) => Math.abs(1 - p.soh))) * 100,
    };
  });

  return { moduleGamma: AGE_GAMMA, cells, points, capacitySoh };
}
