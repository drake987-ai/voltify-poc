import { fail, finish, isNum, isNumArray } from './guards';
import { formatBatteryId, type AdapterError, type Result, type Telemetry } from './schema';

export function isBrandC(raw: unknown): boolean {
  return Array.isArray(raw) && raw[0] === 'C1';
}

export function adaptBrandC(raw: unknown): Result<Telemetry, AdapterError> {
  if (!Array.isArray(raw) || raw.length !== 12 || raw[0] !== 'C1') {
    return fail('malformed', 'brand C payload must be a 12-element array tagged "C1"');
  }
  const [, serial, tsSec, packCentiV, offsetsMv, currentDeciA, coreHalfC, ambHalfC, socPct, latE5, lngE5, cycles] =
    raw as unknown[];

  if (
    !isNum(serial) || !isNum(tsSec) || !isNum(packCentiV) || !isNumArray(offsetsMv) || offsetsMv.length === 0 ||
    !isNum(currentDeciA) || !isNum(coreHalfC) || !isNum(ambHalfC) || !isNum(socPct) ||
    !isNum(latE5) || !isNum(lngE5) || !isNum(cycles)
  ) {
    return fail('malformed', 'brand C payload has a missing or non-numeric field');
  }

  // Cells are not sent individually: rebuild each from the pack mean plus its offset.
  const meanCellV = packCentiV / 100 / offsetsMv.length;

  return finish({
    batteryId: formatBatteryId('C', serial),
    brand: 'C',
    ts: tsSec * 1000,
    cellVoltages: offsetsMv.map((mv) => meanCellV + mv / 1000),
    current: currentDeciA / 10, // discharge positive
    coreTemp: coreHalfC / 2,
    ambientTemp: ambHalfC / 2,
    soc: socPct / 100,
    lat: latE5 / 1e5,
    lng: lngE5 / 1e5,
    cycleCount: cycles,
  });
}
