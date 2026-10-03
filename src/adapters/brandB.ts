import { fail, finish, isNum, isNumArray, isRecord } from './guards';
import { formatBatteryId, type AdapterError, type Result, type Telemetry } from './schema';

export function isBrandB(raw: unknown): boolean {
  return isRecord(raw) && 'device' in raw && 'pack' in raw;
}

export function adaptBrandB(raw: unknown): Result<Telemetry, AdapterError> {
  if (!isRecord(raw)) return fail('malformed', 'brand B payload is not an object');
  const { device, timestamp, pack, thermal, location, cycleCount } = raw;

  if (!isRecord(device) || !isRecord(pack) || !isRecord(thermal) || !isRecord(location)) {
    return fail('malformed', 'brand B payload is missing a nested section');
  }
  const id = typeof device.id === 'string' ? /^db_(\d+)$/.exec(device.id) : null;
  if (!id) return fail('malformed', `brand B device.id "${String(device.id)}" is not db_<serial>`);

  const ts = typeof timestamp === 'string' ? Date.parse(timestamp) : Number.NaN;
  if (!Number.isFinite(ts)) return fail('malformed', 'brand B timestamp is not a valid ISO-8601 string');

  if (!isNum(pack.currentDa) || !isNum(pack.socPermille) || !isNumArray(pack.cellVolts)) {
    return fail('malformed', 'brand B pack section has a missing or non-numeric field');
  }
  if (!isNum(thermal.coreDeciC) || !isNum(thermal.ambientDeciC) || !isNum(cycleCount)) {
    return fail('malformed', 'brand B thermal/cycle fields are missing or non-numeric');
  }
  if (!isNum(location.latitude) || !isNum(location.longitude)) {
    return fail('malformed', 'brand B location is missing or non-numeric');
  }

  return finish({
    batteryId: formatBatteryId('B', Number(id[1])),
    brand: 'B',
    ts,
    cellVoltages: pack.cellVolts,
    // Brand B reports CHARGE as positive; the canonical convention is discharge positive.
    current: (0 - pack.currentDa) / 10,
    coreTemp: thermal.coreDeciC / 10,
    ambientTemp: thermal.ambientDeciC / 10,
    soc: pack.socPermille / 1000,
    lat: location.latitude,
    lng: location.longitude,
    cycleCount,
  });
}
