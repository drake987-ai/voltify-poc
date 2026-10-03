// Module 2: voltage anomaly across the cell groups.
//
// Under load every cell sags by I * R, and R differs a little between cells, so a
// healthy pack under heavy current always shows a spread of tens of mV. To avoid
// mistaking that for a fault, each cell's deviation from the group median is fitted
// against current, dev = a + b * I, by recursive least squares, and only the
// current-independent part c = dev - b * I is judged. Then:
//   * sag: how far the (smoothed) c of a cell sits below the group, as a robust
//     z-score across the cells (median / MAD). A cell leaking charge (internal
//     short) or badly out of balance sags at ANY current.
//   * drift: how far a cell's c has moved relative to the group between a slow
//     (~25 min) and a fast (~2.5 min) average, i.e. a cell that is changing, which
//     catches a short developing while its absolute offset is still small.
//   * weak cell: the slope b itself. A cell whose resistance is well above its
//     neighbours is a maintenance finding, not a fire signal, so its severity is
//     capped.
// Evidence has to persist before it counts in full. Hard limits on a cell's
// voltage are checked directly.
import { AI_CONFIG } from './config';
import { clamp, ramp, robustCentre, smoothingWeight } from './mathutil';
import { ocvSlopeCellAt } from './nominal';
import type { VoltageOutput } from './types';

export interface VoltageState {
  ts: number;
  samples: number;
  /** Per-cell fit dev = a + b * (I / 10): intercept (mV), slope (mV per 10 A) and covariance. */
  a: number[];
  b: number[];
  p11: number[];
  p12: number[];
  p22: number[];
  /** Fast and slow smoothed current-independent deviation of each cell, mV. */
  fast: number[];
  slow: number[];
  anomalousSince: number | null;
  last: VoltageOutput;
}

const EMPTY: VoltageOutput = {
  spreadMv: 0,
  minCellV: 0,
  maxCellV: 0,
  worstCell: 0,
  driftCell: 0,
  sagMv: 0,
  sagSocPct: 0,
  sagZ: 0,
  driftMv: 0,
  driftSocPct: 0,
  driftZ: 0,
  weakCell: 0,
  weakExcessMOhm: 0,
  weakZ: 0,
  samples: 0,
  riseMv: 0,
  persistenceS: 0,
};

const sagScratch = new Float64Array(64);
const driftScratch = new Float64Array(64);
const slopeScratch = new Float64Array(64);

export function initVoltage(ts: number): VoltageState {
  return { ts, samples: 0, a: [], b: [], p11: [], p12: [], p22: [], fast: [], slow: [], anomalousSince: null, last: EMPTY };
}

/** Fraction (0..1) to which the per-cell fit is trusted, from the number of frames seen. */
export const voltageLearned = (samples: number): number => {
  const cfg = AI_CONFIG.voltage;
  return ramp(samples, cfg.minSamples, cfg.fullSamples);
};

/** Severity (0..1) of each kind of voltage evidence, before persistence is applied. */
export function voltageEvidence(o: VoltageOutput): { sag: number; drift: number; weak: number; limit: number } {
  const cfg = AI_CONFIG.voltage;
  const gate = (z: number) => ramp(z, 2, cfg.zFull);
  const learned = voltageLearned(o.samples);
  return {
    sag: ramp(o.sagSocPct, cfg.sagWarnPct, cfg.sagDangerPct) * gate(o.sagZ) * learned,
    drift: ramp(o.driftSocPct, cfg.driftWarnPct, cfg.driftDangerPct) * gate(o.driftZ) * learned,
    weak:
      cfg.weakSeverityCap * ramp(o.weakExcessMOhm, cfg.weakWarnMOhm, cfg.weakFullMOhm) * gate(o.weakZ) * learned,
    limit: o.minCellV < cfg.minCellV || o.maxCellV > cfg.maxCellV ? 1 : 0,
  };
}

export function stepVoltage(
  s: VoltageState,
  ts: number,
  cellVoltages: readonly number[],
  currentA: number,
  soc: number,
): VoltageOutput {
  const cfg = AI_CONFIG.voltage;
  // Voltage differences between cells are amplified where the OCV curve is steep (near empty and full).
  const ocvSlope = ocvSlopeCellAt(soc);
  const slopeScale = Math.max(ocvSlope / cfg.referenceSlope, 0.8);
  const n = Math.min(cellVoltages.length, 64);
  const dt = Math.max(ts - s.ts, 0);

  let vMin = Infinity;
  let vMax = -Infinity;
  for (let i = 0; i < n; i++) {
    const v = cellVoltages[i];
    if (v < vMin) vMin = v;
    if (v > vMax) vMax = v;
  }
  const { median: vMed } = robustCentre(cellVoltages, n);

  const first = s.fast.length !== n;
  if (first) {
    s.a = new Array<number>(n).fill(0);
    s.b = new Array<number>(n).fill(0);
    s.p11 = new Array<number>(n).fill(cfg.rlsPriorSigmaMv ** 2);
    s.p12 = new Array<number>(n).fill(0);
    s.p22 = new Array<number>(n).fill(cfg.rlsPriorSigmaMv ** 2);
    s.fast = new Array<number>(n).fill(0);
    s.slow = new Array<number>(n).fill(0);
    s.samples = 0;
  }
  const aFast = smoothingWeight(dt, cfg.fastTauS);
  const aSlow = smoothingWeight(dt, cfg.slowTauS);
  const phi2 = currentA / 10;
  const lambda = cfg.rlsForgetting;
  const pMax = cfg.rlsPriorSigmaMv ** 2;

  for (let i = 0; i < n; i++) {
    const dev = (cellVoltages[i] - vMed) * 1000;

    // RLS update of dev = a + b * phi2.
    const pPhi1 = s.p11[i] + s.p12[i] * phi2;
    const pPhi2 = s.p12[i] + s.p22[i] * phi2;
    const denom = lambda + pPhi1 + phi2 * pPhi2;
    const k1 = pPhi1 / denom;
    const k2 = pPhi2 / denom;
    const err = dev - (s.a[i] + s.b[i] * phi2);
    s.a[i] += k1 * err;
    s.b[i] += k2 * err;
    s.p11[i] = Math.min((s.p11[i] - k1 * pPhi1) / lambda, pMax);
    s.p12[i] = (s.p12[i] - k1 * pPhi2) / lambda;
    s.p22[i] = Math.min((s.p22[i] - k2 * pPhi2) / lambda, pMax);

    // The part of the deviation that does not depend on current.
    const c = dev - s.b[i] * phi2;
    if (first) {
      s.fast[i] = c;
      s.slow[i] = c;
    } else {
      s.fast[i] += aFast * (c - s.fast[i]);
      s.slow[i] += aSlow * (c - s.slow[i]);
    }
    sagScratch[i] = s.fast[i];
    driftScratch[i] = s.fast[i] - s.slow[i];
    slopeScratch[i] = s.b[i];
  }
  s.samples += 1;

  const sag = robustCentre(sagScratch, n);
  const drift = robustCentre(driftScratch, n);
  const slope = robustCentre(slopeScratch, n);
  const sagSigma = Math.max(sag.sigma, cfg.sigmaFloorMv * slopeScale);
  const driftSigma = Math.max(drift.sigma, cfg.driftSigmaFloorMv * slopeScale);
  const mvPerPct = ocvSlope * 10; // V per unit SOC -> mV per % SOC
  // b is in mV per 10 A, so mV/A = b / 10 and mOhm = b / 10.
  const slopeSigmaMOhm = Math.max(slope.sigma / 10, cfg.weakResistanceFloorMOhm);

  let worst = 0;
  let worstSag = Infinity;
  let highest = -Infinity;
  let driftCell = 0;
  let lowestDrift = Infinity;
  // A cell that sags more as current rises (higher resistance) has the most negative slope b.
  let weakCell = 0;
  let lowestSlope = Infinity;
  for (let i = 0; i < n; i++) {
    if (sagScratch[i] < worstSag) {
      worstSag = sagScratch[i];
      worst = i;
    }
    if (sagScratch[i] > highest) highest = sagScratch[i];
    if (driftScratch[i] < lowestDrift) {
      lowestDrift = driftScratch[i];
      driftCell = i;
    }
    if (slopeScratch[i] < lowestSlope) {
      lowestSlope = slopeScratch[i];
      weakCell = i;
    }
  }
  const weakExcessMOhm = (slope.median - lowestSlope) / 10;

  const out: VoltageOutput = {
    spreadMv: (vMax - vMin) * 1000,
    minCellV: vMin,
    maxCellV: vMax,
    worstCell: worst,
    driftCell,
    sagMv: sag.median - worstSag,
    sagSocPct: Math.min((sag.median - worstSag) / mvPerPct, 100),
    sagZ: (sag.median - worstSag) / sagSigma,
    driftMv: drift.median - lowestDrift,
    driftSocPct: Math.min((drift.median - lowestDrift) / mvPerPct, 100),
    driftZ: (drift.median - lowestDrift) / driftSigma,
    weakCell,
    weakExcessMOhm,
    weakZ: weakExcessMOhm / slopeSigmaMOhm,
    samples: s.samples,
    riseMv: highest - sag.median,
    persistenceS: 0,
  };

  const ev = voltageEvidence(out);
  const anomalous = Math.max(ev.sag, ev.drift, ev.weak, ev.limit) > 0.12;
  if (anomalous) s.anomalousSince ??= ts;
  else s.anomalousSince = null;
  out.persistenceS = s.anomalousSince === null ? 0 : ts - s.anomalousSince;

  s.ts = ts;
  s.last = out;
  return out;
}

/** Fraction (0..1) of the persistence requirement that has been met. */
export const voltagePersistence = (o: VoltageOutput): number => clamp(o.persistenceS / AI_CONFIG.voltage.persistS, 0, 1);
