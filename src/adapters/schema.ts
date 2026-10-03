// Canonical telemetry schema (CLAUDE.md section 4). Everything downstream of the
// adapters (AI engine, UI) sees only this shape, never a vendor payload and
// never simulator ground truth.

export const BRANDS = ['A', 'B', 'C'] as const;
export type Brand = (typeof BRANDS)[number];

export type Telemetry = {
  batteryId: string;
  brand: Brand;
  /** Epoch milliseconds. */
  ts: number;
  /** V, one entry per series cell group (e.g. 16S). */
  cellVoltages: number[];
  /** A, positive = discharge, negative = charge. */
  current: number;
  /** degC, pack core temperature sensor. */
  coreTemp: number;
  /** degC, temperature of the air around the pack. */
  ambientTemp: number;
  /** 0..1 */
  soc: number;
  lat: number;
  lng: number;
  /** Equivalent full cycles accumulated so far. */
  cycleCount: number;
};

/** Plausibility limits: outside these a reading is treated as a sensor fault, not data. */
export const TELEMETRY_LIMITS = {
  cellVoltageV: [1.5, 5.0],
  currentA: [-250, 250],
  coreTempC: [-40, 150],
  ambientTempC: [-40, 90],
  soc: [0, 1],
} as const;

const inRange = (x: number, [lo, hi]: readonly [number, number]) => Number.isFinite(x) && x >= lo && x <= hi;

/** Returns a list of human-readable problems; empty means the record is valid. */
export function telemetryIssues(t: Telemetry): string[] {
  const issues: string[] = [];
  if (!(BRANDS as readonly string[]).includes(t.brand)) issues.push(`unknown brand "${t.brand}"`);
  if (!/^[ABC]-\d{4,}$/.test(t.batteryId)) issues.push(`malformed batteryId "${t.batteryId}"`);
  if (!Number.isFinite(t.ts)) issues.push('ts is not finite');
  if (t.cellVoltages.length === 0) issues.push('cellVoltages is empty');
  t.cellVoltages.forEach((v, i) => {
    if (!inRange(v, TELEMETRY_LIMITS.cellVoltageV)) issues.push(`cellVoltages[${i}]=${v} out of range`);
  });
  if (!inRange(t.current, TELEMETRY_LIMITS.currentA)) issues.push(`current=${t.current} out of range`);
  if (!inRange(t.coreTemp, TELEMETRY_LIMITS.coreTempC)) issues.push(`coreTemp=${t.coreTemp} out of range`);
  if (!inRange(t.ambientTemp, TELEMETRY_LIMITS.ambientTempC)) issues.push(`ambientTemp=${t.ambientTemp} out of range`);
  if (!inRange(t.soc, TELEMETRY_LIMITS.soc)) issues.push(`soc=${t.soc} out of range`);
  if (!Number.isFinite(t.lat) || Math.abs(t.lat) > 90) issues.push(`lat=${t.lat} out of range`);
  if (!Number.isFinite(t.lng) || Math.abs(t.lng) > 180) issues.push(`lng=${t.lng} out of range`);
  if (!Number.isFinite(t.cycleCount) || t.cycleCount < 0) issues.push(`cycleCount=${t.cycleCount} invalid`);
  return issues;
}

export const isValidTelemetry = (t: Telemetry): boolean => telemetryIssues(t).length === 0;

/** Canonical id, e.g. ("A", 412) -> "A-0412". */
export function formatBatteryId(brand: Brand, serial: number): string {
  return `${brand}-${String(serial).padStart(4, '0')}`;
}

/** Numeric serial of a canonical id ("A-0412" -> 412). */
export function serialOf(batteryId: string): number {
  return Number.parseInt(batteryId.slice(2), 10);
}

export type AdapterErrorCode = 'unknown_format' | 'malformed' | 'out_of_range';

export interface AdapterError {
  code: AdapterErrorCode;
  /** Developer-facing description (not shown in the UI). */
  message: string;
}

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
