// Real public data used to test the SOH module: the NASA Prognostics Center of Excellence
// "Li-ion Battery Aging" experiment (four 18650 cells, B0005, B0006, B0007 and B0018, cycled at room
// temperature until they lost 30 % of their rated 2 Ah capacity, with impedance measured along the way).
// Only what the screen needs is kept (see scripts/extractNasaPcoe.mjs): per cell, the discharge capacity of
// every cycle, and every impedance measurement (Re, Rct) with the capacity at that moment.
import raw from './nasaPcoe.json';

export const PCOE_CELLS = ['B0005', 'B0006', 'B0007', 'B0018'] as const;
export type PcoeCell = (typeof PCOE_CELLS)[number];

export interface PcoeCellData {
  /** [discharge cycle number, capacity in Ah] for every discharge. */
  capacity: [number, number][];
  /** [discharge cycle number, capacity in Ah at that moment, Re in ohm, Rct in ohm] for every impedance measurement. */
  impedance: [number, number, number, number][];
}

export const PCOE_DATA = raw as Record<PcoeCell, PcoeCellData>;

export const PCOE_SOURCE = {
  name: 'NASA Prognostics Data Repository, Li-ion Battery Aging Datasets',
  citation: 'B. Saha and K. Goebel (2007). Battery Data Set, NASA Prognostics Data Repository, NASA Ames Research Center, Moffett Field, CA',
  url: 'https://www.nasa.gov/intelligent-systems-division/discovery-and-systems-health/pcoe/pcoe-data-set-repository/',
  /** Rated capacity of the cells, Ah, and the end-of-life criterion of the experiment (a 30 % fade). */
  ratedAh: 2,
  endOfLifeAh: 1.4,
} as const;
