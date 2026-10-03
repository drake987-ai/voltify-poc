// What the platform knows about each vendor's pack from its datasheet: NOMINAL
// values only. It does not know any individual unit's real hA, capacity, resistance
// spread, health, or hidden hazards (poor cooling, an internal short). Those are
// exactly what the AI has to infer from telemetry.
//
// This is the ONLY file in src/ai allowed to import from src/sim (a test enforces
// it), so simulator ground truth cannot leak into the AI by accident.
import type { Brand } from '../adapters/schema';
import { r0Factor } from '../sim/ecm';
import { ocv } from '../sim/ocv';
import { BMS, BRAND_SPECS, CELL, THERMAL } from '../sim/params';

export interface PackNominal {
  seriesCells: number;
  parallelCells: number;
  /** Ah, rated capacity of a new pack. */
  capacityAh: number;
  /** ohm, DC resistance of the whole new pack at 25 degC. */
  r0PackOhm25: number;
  /** R1 / R0 and the RC time constant (s) of the polarisation branch. */
  r1Ratio: number;
  tauRcS: number;
  /** J/K and W/K of a typical unit of this pack (individual units vary). */
  thermalCapacityJPerK: number;
  thermalConductanceWPerK: number;
  /** V of pack open-circuit voltage per unit of SOC, mid-range. */
  ocvSlopePackVPerSoc: number;
}

const ocvSlopeCell = (ocv(0.9) - ocv(0.2)) / 0.7;

/**
 * Local slope of a cell's open-circuit voltage against SOC (V per unit SOC) from the
 * chemistry's nominal curve. It is steep near empty and full, so the same small
 * charge imbalance between cells shows up as a much bigger voltage difference there.
 */
export function ocvSlopeCellAt(soc: number): number {
  const s = Math.min(Math.max(soc, 0.03), 0.97);
  return (ocv(s + 0.02) - ocv(s - 0.02)) / 0.04;
}

function nominalFor(brand: Brand): PackNominal {
  const spec = BRAND_SPECS[brand];
  return {
    seriesCells: CELL.seriesCells,
    parallelCells: spec.parallelCells,
    capacityAh: spec.parallelCells * CELL.cellCapacityAh,
    r0PackOhm25: (CELL.seriesCells * CELL.r0CellOhm) / spec.parallelCells,
    r1Ratio: CELL.r1Ratio,
    tauRcS: CELL.tauRcS,
    thermalCapacityJPerK: THERMAL.capacityJPerK * spec.thermalCScale,
    thermalConductanceWPerK: THERMAL.conductanceWPerK * spec.thermalHAScale,
    ocvSlopePackVPerSoc: ocvSlopeCell * CELL.seriesCells,
  };
}

export const PACK_NOMINAL: Record<Brand, PackNominal> = {
  A: nominalFor('A'),
  B: nominalFor('B'),
  C: nominalFor('C'),
};

/** The traditional BMS cut-off, which Voltify tries to warn well ahead of. */
export const LIMIT_TEMP_C = BMS.tripTempC;

/** R grows as 1 + gamma * (1 - SOH): the nominal ageing law of the cell chemistry. */
export const AGE_GAMMA = CELL.ageResistanceGamma;

/** Temperature dependence of internal resistance (1 at 25 degC, falling as the cell warms). */
export const resistanceTempFactor = (tempC: number): number => r0Factor(tempC, 1);

/**
 * Measurement noise (1 sigma, degC) of the core-temperature channel as seen by the
 * platform: sensor noise plus the vendor's published resolution (brand C only
 * reports 0.5 degC steps, which adds ~0.14 degC of quantisation noise).
 */
export const TEMP_SIGMA_C: Record<Brand, number> = { A: 0.1, B: 0.1, C: 0.17 };
