// Shapes of the three (fictional) vendor telemetry feeds. They deliberately
// differ in field names, units, sign convention, timestamp format, resolution
// and reporting interval, which is the real-world problem the adapter solves.
// They are written from each "vendor spec", so adapters parse `unknown` input and
// do not trust that a payload matches these types.

/** Brand A ("Selex-like"): flat snake_case JSON, every 5 s. mV, A (discharge +), 0.1 degC, epoch ms. */
export interface BrandAPayload {
  bat_id: string; // "SLX-0412"
  ts_ms: number;
  cells_mv: number[];
  i_a: number; // 0.1 A resolution, discharge positive
  temp_c: number; // core, 0.1 degC
  amb_c: number;
  soc_pct: number; // 0..100, 0.1 % resolution
  gps: { lat: number; lng: number };
  cycles: number;
}

/** Brand B ("Dat Bike-like"): nested camelCase JSON, every 10 s. V, deci-amps CHARGE positive, ISO-8601. */
export interface BrandBPayload {
  device: { id: string; fw: string }; // id "db_0412"
  timestamp: string;
  pack: {
    currentDa: number; // 0.1 A units, CHARGE positive (sign inverted vs canonical)
    socPermille: number; // 0..1000
    cellVolts: number[];
  };
  thermal: { coreDeciC: number; ambientDeciC: number }; // 0.1 degC integers
  location: { latitude: number; longitude: number };
  cycleCount: number;
}

/**
 * Brand C ("VinFast-like"): compact positional array, every 15 s, schema tag "C1".
 * Cell voltages are not sent individually: only the pack voltage plus each cell's
 * offset from the mean in mV. Core temperature has 0.5 degC resolution, SOC 1 %.
 */
export type BrandCPayload = readonly [
  'C1',
  number, // device serial
  number, // epoch seconds
  number, // pack voltage, 0.01 V units
  number[], // per-cell offset from mean, mV
  number, // current, 0.1 A units, discharge positive
  number, // core temp, 0.5 degC units
  number, // ambient temp, 0.5 degC units
  number, // SOC, whole percent
  number, // latitude x 1e5
  number, // longitude x 1e5
  number, // cycles
];
