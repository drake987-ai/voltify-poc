import { fail, finish, isNum, isNumArray, isRecord } from './guards';
import { formatBatteryId, type AdapterError, type Result, type Telemetry } from './schema';

export function isBrandA(raw: unknown): boolean {
  return isRecord(raw) && 'bat_id' in raw && 'cells_mv' in raw;
}

export function adaptBrandA(raw: unknown): Result<Telemetry, AdapterError> {
  if (!isRecord(raw)) return fail('malformed', 'brand A payload is not an object');
  const { bat_id, ts_ms, cells_mv, i_a, temp_c, amb_c, soc_pct, gps, cycles } = raw;

  const id = typeof bat_id === 'string' ? /^SLX-(\d+)$/.exec(bat_id) : null;
  if (!id) return fail('malformed', `brand A bat_id "${String(bat_id)}" is not SLX-<serial>`);
  if (!isNum(ts_ms) || !isNumArray(cells_mv) || !isNum(i_a) || !isNum(temp_c) || !isNum(amb_c)) {
    return fail('malformed', 'brand A payload has a missing or non-numeric field');
  }
  if (!isNum(soc_pct) || !isNum(cycles) || !isRecord(gps) || !isNum(gps.lat) || !isNum(gps.lng)) {
    return fail('malformed', 'brand A payload has a missing or non-numeric field');
  }

  return finish({
    batteryId: formatBatteryId('A', Number(id[1])),
    brand: 'A',
    ts: ts_ms,
    cellVoltages: cells_mv.map((mv) => mv / 1000),
    current: i_a, // already discharge-positive
    coreTemp: temp_c,
    ambientTemp: amb_c,
    soc: soc_pct / 100,
    lat: gps.lat,
    lng: gps.lng,
    cycleCount: cycles,
  });
}
