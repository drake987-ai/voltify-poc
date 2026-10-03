// Synthetic data generators for testing each AI module in isolation, with known
// truth and none of the simulator's own code in the loop (apart from the PRNG).
import type { Brand } from '@/adapters';
import { PACK_NOMINAL } from '@/ai';
import { clamp, createRng, nextNormal, ocv, type Rng } from '@/sim';

/** Reporting interval in seconds of each vendor. */
export const DT_S: Record<Brand, number> = { A: 5, B: 10, C: 15 };

export interface ThermalSample {
  ts: number;
  temp: number;
  ambient: number;
  current: number;
  /** Noise-free true temperature at this instant. */
  trueTemp: number;
  trueHeat: number;
}

export interface ThermalSynthOptions {
  brand: Brand;
  durationS: number;
  /** Extra heat (W) the standard model does not know about, as a function of time. */
  extraHeatW?: (tS: number) => number;
  ambientC?: number;
  startTempC?: number;
  /** The pack's true hA relative to the nominal one (1 = as the platform assumes). */
  coolingScale?: number;
  /** Measurement noise sigma (degC) and resolution (degC) of the temperature channel. */
  sigmaC?: number;
  resolutionC?: number;
  /** Pack resistance used both to generate the truth and (by the caller) by the filter. */
  packOhm?: number;
  seed?: number;
}

/** Current profile: a bursty ride (AR(1) around 15 A, with regen), reproducible from the seed. */
function nextCurrent(rng: Rng, prev: number): number {
  return clamp(0.9 * prev + 0.1 * 15 + 9 * nextNormal(rng), -8, 55);
}

export function synthThermal(o: ThermalSynthOptions): ThermalSample[] {
  const nom = PACK_NOMINAL[o.brand];
  const hA = nom.thermalConductanceWPerK * (o.coolingScale ?? 1);
  const C = nom.thermalCapacityJPerK;
  const tau = C / hA;
  const ambient = o.ambientC ?? 36;
  const packOhm = o.packOhm ?? 0.07;
  const sigma = o.sigmaC ?? 0.1;
  const res = o.resolutionC ?? 0.1;
  const rng = createRng(o.seed ?? 1);

  const out: ThermalSample[] = [];
  let truth = o.startTempC ?? ambient + 4;
  let current = 12;
  const internalDt = 1;
  const dt = DT_S[o.brand];
  for (let t = 0; t < o.durationS; t += internalDt) {
    if (t % dt === 0) {
      current = nextCurrent(rng, current);
      const noisy = truth + sigma * nextNormal(rng);
      out.push({
        ts: t,
        temp: Math.round(noisy / res) * res,
        ambient: ambient + 0.2 * nextNormal(rng),
        current,
        trueTemp: truth,
        trueHeat: o.extraHeatW?.(t) ?? 0,
      });
    }
    const q = current * current * packOhm + (o.extraHeatW?.(t) ?? 0);
    const tss = ambient + q / hA;
    truth = tss + (truth - tss) * Math.exp(-internalDt / tau);
  }
  return out;
}

export interface CellSample {
  ts: number;
  cells: number[];
  current: number;
  soc: number;
}

export interface CellSynthOptions {
  durationS: number;
  dtS?: number;
  startSoc?: number;
  /** Per-cell resistance (ohm); default about 3.2 mOhm with 3 % spread. */
  resistances?: number[];
  /** Cell index and rate (SOC fraction per second, positive = loses charge) of a leaking cell. */
  leak?: { cell: number; ratePerS: number; startS: number };
  /** Static SOC offset of each cell (fraction). */
  socOffsets?: number[];
  seed?: number;
}

export function synthCells(o: CellSynthOptions): CellSample[] {
  const n = 16;
  const rng = createRng(o.seed ?? 3);
  const dt = o.dtS ?? 5;
  const r = o.resistances ?? Array.from({ length: n }, () => 0.0032 * (1 + 0.03 * nextNormal(rng)));
  const offsets = o.socOffsets ?? Array.from({ length: n }, () => 0.004 * nextNormal(rng));
  let soc = o.startSoc ?? 0.7;
  let current = 10;
  let leaked = 0;
  const out: CellSample[] = [];
  for (let t = 0; t < o.durationS; t += dt) {
    current = nextCurrent(rng, current);
    soc = clamp(soc - (current * dt) / 3600 / 22, 0.02, 1);
    if (o.leak && t >= o.leak.startS) leaked += o.leak.ratePerS * dt;
    const cells = r.map((ri, i) => {
      const cellSoc = soc + offsets[i] - (o.leak && i === o.leak.cell ? leaked : 0);
      return ocv(clamp(cellSoc, 0, 1)) - current * ri + 0.0008 * nextNormal(rng);
    });
    out.push({ ts: t, cells, current, soc });
  }
  return out;
}

export interface PackSample {
  ts: number;
  voltage: number;
  current: number;
  temp: number;
  trueSoh: number;
}

/**
 * A pack with a 1-RC circuit sampled at the vendor's own interval, using the
 * nominal ageing law, so the estimator is judged against a known resistance.
 */
export function synthPack(opts: { brand: Brand; soh: number; tempC?: number; durationS: number; seed?: number }): PackSample[] {
  const nom = PACK_NOMINAL[opts.brand];
  const rng = createRng(opts.seed ?? 5);
  const dt = DT_S[opts.brand];
  const tempC = opts.tempC ?? 25;
  const tK = tempC + 273.15;
  const fT = Math.exp((20000 / 8.314462618) * (1 / tK - 1 / 298.15));
  const r0 = nom.r0PackOhm25 * fT * (1 + 4 * (1 - opts.soh));
  const r1 = nom.r1Ratio * r0;
  const a = Math.exp(-dt / nom.tauRcS);
  let soc = 0.8;
  let v1 = 0;
  let current = 10;
  const out: PackSample[] = [];
  for (let t = 0; t < opts.durationS; t += dt) {
    current = nextCurrent(rng, current);
    v1 = a * v1 + r1 * (1 - a) * current;
    soc = clamp(soc - (current * dt) / 3600 / (nom.capacityAh * opts.soh), 0.05, 1);
    const voltage = 16 * ocv(soc) - current * r0 - v1 + 0.003 * nextNormal(rng);
    out.push({ ts: t, voltage, current: current + 0.15 * nextNormal(rng), temp: tempC, trueSoh: opts.soh });
  }
  return out;
}
