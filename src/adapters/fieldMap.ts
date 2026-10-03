// Where each canonical field comes from in each vendor's payload, and how it is converted.
// This is documentation the Cross-brand Hub shows next to the live payloads. The conversions
// themselves live in the adapters (and are tested there); the paths below are checked against real
// vendor payloads by tests, so the table cannot point at a field that does not exist.
import type { Brand } from './schema';

export const CANONICAL_FIELDS = [
  'batteryId',
  'ts',
  'cellVoltages',
  'current',
  'coreTemp',
  'ambientTemp',
  'soc',
  'position',
  'cycleCount',
] as const;
export type CanonicalField = (typeof CANONICAL_FIELDS)[number];

export interface FieldSource {
  /** Where to find it in the payload: dotted for objects (`pack.cellVolts`), `[n]` for positions of an array. */
  paths: readonly string[];
  /** The vendor's unit or encoding. */
  unit: string;
  /** The conversion to the canonical field, in plain notation. */
  expr: string;
}

export const FIELD_MAP: Record<Brand, Record<CanonicalField, FieldSource>> = {
  A: {
    batteryId: { paths: ['bat_id'], unit: 'SLX-<n>', expr: 'SLX-<n> → A-<n>' },
    ts: { paths: ['ts_ms'], unit: 'epoch ms', expr: 'ts_ms' },
    cellVoltages: { paths: ['cells_mv'], unit: 'mV', expr: 'cells_mv[i] / 1000' },
    current: { paths: ['i_a'], unit: 'A, discharge +', expr: 'i_a' },
    coreTemp: { paths: ['temp_c'], unit: '0.1 °C', expr: 'temp_c' },
    ambientTemp: { paths: ['amb_c'], unit: '0.1 °C', expr: 'amb_c' },
    soc: { paths: ['soc_pct'], unit: '% (0.1)', expr: 'soc_pct / 100' },
    position: { paths: ['gps.lat', 'gps.lng'], unit: 'deg', expr: 'gps.lat, gps.lng' },
    cycleCount: { paths: ['cycles'], unit: 'cycles', expr: 'cycles' },
  },
  B: {
    batteryId: { paths: ['device.id'], unit: 'db_<n>', expr: 'db_<n> → B-<n>' },
    ts: { paths: ['timestamp'], unit: 'ISO-8601', expr: 'Date.parse(timestamp)' },
    cellVoltages: { paths: ['pack.cellVolts'], unit: 'V', expr: 'cellVolts[i]' },
    current: { paths: ['pack.currentDa'], unit: '0.1 A, charge +', expr: '−currentDa / 10' },
    coreTemp: { paths: ['thermal.coreDeciC'], unit: '0.1 °C', expr: 'coreDeciC / 10' },
    ambientTemp: { paths: ['thermal.ambientDeciC'], unit: '0.1 °C', expr: 'ambientDeciC / 10' },
    soc: { paths: ['pack.socPermille'], unit: '‰', expr: 'socPermille / 1000' },
    position: { paths: ['location.latitude', 'location.longitude'], unit: 'deg', expr: 'latitude, longitude' },
    cycleCount: { paths: ['cycleCount'], unit: 'cycles', expr: 'cycleCount' },
  },
  C: {
    batteryId: { paths: ['[1]'], unit: 'serial', expr: 'C-<[1]>' },
    ts: { paths: ['[2]'], unit: 'epoch s', expr: '[2] × 1000' },
    cellVoltages: { paths: ['[3]', '[4]'], unit: '0.01 V pack, mV offsets', expr: '[3] / 100 / n + [4][i] / 1000' },
    current: { paths: ['[5]'], unit: '0.1 A, discharge +', expr: '[5] / 10' },
    coreTemp: { paths: ['[6]'], unit: '0.5 °C', expr: '[6] / 2' },
    ambientTemp: { paths: ['[7]'], unit: '0.5 °C', expr: '[7] / 2' },
    soc: { paths: ['[8]'], unit: '% (1)', expr: '[8] / 100' },
    position: { paths: ['[9]', '[10]'], unit: '1e-5 deg', expr: '[9] / 1e5, [10] / 1e5' },
    cycleCount: { paths: ['[11]'], unit: 'cycles', expr: '[11]' },
  },
};

/** Read a value out of a payload by one of the paths above; undefined if it is not there. */
export function locate(payload: unknown, path: string): unknown {
  let cur: unknown = payload;
  for (const part of path.split('.')) {
    const m = /^\[(\d+)\]$/.exec(part);
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = m ? (cur as Record<number, unknown>)[Number(m[1])] : (cur as Record<string, unknown>)[part];
  }
  return cur;
}
