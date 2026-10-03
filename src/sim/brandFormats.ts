// The three fictional vendor "servers": each takes the pack's sensor reading and
// serialises it in its own format, with its own units, sign convention,
// resolution and timestamp style. The adapters in src/adapters undo this.
import type { BrandAPayload, BrandBPayload, BrandCPayload } from '../adapters/rawTypes';
import { serialOf, type Telemetry } from '../adapters/schema';

const round = Math.round;
const round1 = (x: number) => round(x * 10) / 10;
const round6 = (x: number) => round(x * 1e6) / 1e6;
const pad4 = (n: number) => String(n).padStart(4, '0');

export function encodeBrandA(t: Telemetry): BrandAPayload {
  return {
    bat_id: `SLX-${pad4(serialOf(t.batteryId))}`,
    ts_ms: t.ts,
    cells_mv: t.cellVoltages.map((v) => round(v * 1000)),
    i_a: round1(t.current),
    temp_c: round1(t.coreTemp),
    amb_c: round1(t.ambientTemp),
    soc_pct: round1(t.soc * 100),
    gps: { lat: round6(t.lat), lng: round6(t.lng) },
    cycles: t.cycleCount,
  };
}

export function encodeBrandB(t: Telemetry): BrandBPayload {
  return {
    device: { id: `db_${pad4(serialOf(t.batteryId))}`, fw: '2.4.1' },
    timestamp: new Date(t.ts).toISOString(),
    pack: {
      // Brand B counts CHARGE as positive, so the sign is flipped on the way out.
      currentDa: 0 - round(t.current * 10),
      socPermille: round(t.soc * 1000),
      cellVolts: t.cellVoltages.map((v) => round(v * 1000) / 1000),
    },
    thermal: { coreDeciC: round(t.coreTemp * 10), ambientDeciC: round(t.ambientTemp * 10) },
    location: { latitude: round6(t.lat), longitude: round6(t.lng) },
    cycleCount: t.cycleCount,
  };
}

export function encodeBrandC(t: Telemetry): BrandCPayload {
  const sum = t.cellVoltages.reduce((s, v) => s + v, 0);
  const mean = sum / t.cellVoltages.length;
  return [
    'C1',
    serialOf(t.batteryId),
    round(t.ts / 1000),
    round(sum * 100),
    t.cellVoltages.map((v) => round((v - mean) * 1000)),
    round(t.current * 10),
    round(t.coreTemp * 2), // 0.5 degC resolution: coarser than A and B
    round(t.ambientTemp * 2),
    round(t.soc * 100), // whole-percent SOC
    round(t.lat * 1e5),
    round(t.lng * 1e5),
    t.cycleCount,
  ];
}

/** Serialise a reading the way its own vendor would send it. */
export function encodeTelemetry(t: Telemetry): BrandAPayload | BrandBPayload | BrandCPayload {
  switch (t.brand) {
    case 'A':
      return encodeBrandA(t);
    case 'B':
      return encodeBrandB(t);
    case 'C':
      return encodeBrandC(t);
  }
}
