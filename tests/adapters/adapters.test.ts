import { describe, expect, it } from 'vitest';
import {
  detectBrand,
  isValidTelemetry,
  normalize,
  telemetryIssues,
  type Brand,
  type Telemetry,
} from '@/adapters';
import { createFleet, encodeBrandA, encodeBrandB, encodeBrandC, stepFleet } from '@/sim';

const TELEMETRY_KEYS = [
  'ambientTemp',
  'batteryId',
  'brand',
  'cellVoltages',
  'coreTemp',
  'current',
  'cycleCount',
  'lat',
  'lng',
  'soc',
  'ts',
];

const sample = (over: Partial<Telemetry> = {}): Telemetry => ({
  batteryId: 'A-0412',
  brand: 'A',
  ts: 1_781_500_000_000,
  cellVoltages: Array.from({ length: 16 }, (_, i) => 3.7 + i * 0.001),
  current: 12.3,
  coreTemp: 41.27,
  ambientTemp: 36.84,
  soc: 0.7834,
  lat: 10.776889,
  lng: 106.700806,
  cycleCount: 587,
  ...over,
});

// Half of each vendor's quantisation step: the most a round trip may lose.
const TOLERANCE: Record<Brand, { cell: number; current: number; temp: number; soc: number; geo: number }> = {
  A: { cell: 0.0005, current: 0.05, temp: 0.05, soc: 0.0005, geo: 5e-7 },
  B: { cell: 0.0005, current: 0.05, temp: 0.05, soc: 0.0005, geo: 5e-7 },
  C: { cell: 0.0012, current: 0.05, temp: 0.25, soc: 0.005, geo: 5e-6 },
};

describe('round trip: sensor reading -> vendor payload -> adapter', () => {
  it('recovers every field within the vendor quantisation, for all three brands, over real simulated traffic', () => {
    const fleet = createFleet({ seed: 17, n: 60 });
    const seen: Record<Brand, number> = { A: 0, B: 0, C: 0 };
    for (let tick = 0; tick < 60; tick++) {
      const { frames } = stepFleet(fleet);
      for (const frame of frames) {
        const truth = fleet.batteries[Number.parseInt(frame.batteryId.slice(2), 10) - 1].reading;
        const sent = JSON.parse(JSON.stringify(frame.payload)); // it travels as JSON
        const res = normalize(sent);
        expect(res.ok).toBe(true);
        if (!res.ok) continue;
        const t = res.value;
        const tol = TOLERANCE[truth.brand];
        seen[truth.brand]++;
        expect(t.batteryId).toBe(truth.batteryId);
        expect(t.brand).toBe(truth.brand);
        expect(t.ts).toBe(truth.ts);
        expect(t.cycleCount).toBe(truth.cycleCount);
        expect(t.cellVoltages).toHaveLength(truth.cellVoltages.length);
        t.cellVoltages.forEach((v, i) => expect(Math.abs(v - truth.cellVoltages[i])).toBeLessThanOrEqual(tol.cell));
        expect(Math.abs(t.current - truth.current)).toBeLessThanOrEqual(tol.current);
        expect(Math.abs(t.coreTemp - truth.coreTemp)).toBeLessThanOrEqual(tol.temp);
        expect(Math.abs(t.ambientTemp - truth.ambientTemp)).toBeLessThanOrEqual(tol.temp);
        expect(Math.abs(t.soc - truth.soc)).toBeLessThanOrEqual(tol.soc);
        expect(Math.abs(t.lat - truth.lat)).toBeLessThanOrEqual(tol.geo);
        expect(Math.abs(t.lng - truth.lng)).toBeLessThanOrEqual(tol.geo);
      }
    }
    expect(seen.A).toBeGreaterThan(100);
    expect(seen.B).toBeGreaterThan(100);
    expect(seen.C).toBeGreaterThan(100);
  });

  it('outputs exactly the canonical Telemetry fields and nothing else', () => {
    const fleet = createFleet({ seed: 17, n: 9 });
    for (const frame of stepFleet(fleet).frames) {
      const res = normalize(frame.payload);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(Object.keys(res.value).sort()).toEqual(TELEMETRY_KEYS);
        expect(isValidTelemetry(res.value)).toBe(true);
      }
    }
  });
});

describe('vendor quirks', () => {
  it('brand B reports charge as positive; the adapter restores discharge-positive', () => {
    const discharge = encodeBrandB(sample({ batteryId: 'B-0007', brand: 'B', current: 12.3 }));
    expect(discharge.pack.currentDa).toBe(-123);
    const charge = encodeBrandB(sample({ batteryId: 'B-0007', brand: 'B', current: -5 }));
    expect(charge.pack.currentDa).toBe(50);

    const back = normalize(discharge);
    expect(back.ok && back.value.current).toBeCloseTo(12.3, 9);
    const backCharge = normalize(charge);
    expect(backCharge.ok && backCharge.value.current).toBeCloseTo(-5, 9);
  });

  it('brand C sends pack voltage plus per-cell offsets, and core temperature at 0.5 degC resolution', () => {
    const t = sample({ batteryId: 'C-0033', brand: 'C', coreTemp: 41.27 });
    const payload = encodeBrandC(t);
    expect(payload[0]).toBe('C1');
    expect(payload[4]).toHaveLength(16); // offsets, not absolute voltages
    expect(payload[6]).toBe(83); // 41.27 degC -> 41.5 degC in half-degree units
    const back = normalize(payload);
    expect(back.ok && back.value.coreTemp).toBe(41.5);
    expect(back.ok && back.value.soc).toBeCloseTo(0.78, 9); // whole-percent SOC
  });

  it('every vendor uses a different id and timestamp format', () => {
    expect(encodeBrandA(sample()).bat_id).toBe('SLX-0412');
    const b = encodeBrandB(sample({ brand: 'B', batteryId: 'B-0412' }));
    expect(b.device.id).toBe('db_0412');
    expect(b.timestamp).toBe(new Date(1_781_500_000_000).toISOString());
    expect(encodeBrandC(sample({ brand: 'C', batteryId: 'C-0412' }))[1]).toBe(412);
  });
});

describe('format detection and bad input', () => {
  it('detects the vendor from the payload shape alone', () => {
    expect(detectBrand(encodeBrandA(sample()))).toBe('A');
    expect(detectBrand(encodeBrandB(sample({ brand: 'B', batteryId: 'B-0001' })))).toBe('B');
    expect(detectBrand(encodeBrandC(sample({ brand: 'C', batteryId: 'C-0001' })))).toBe('C');
    expect(detectBrand({ foo: 1 })).toBeNull();
  });

  it.each([[null], [undefined], [42], ['text'], [[]], [{}], [['C2', 1]]])(
    'rejects %j as an unknown format without throwing',
    (raw) => {
      const res = normalize(raw);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error.code).toBe('unknown_format');
    },
  );

  it('flags malformed payloads with a typed error', () => {
    const a = encodeBrandA(sample());
    const cases: [string, unknown][] = [
      ['A missing field', { ...a, i_a: undefined }],
      ['A non-numeric temperature', { ...a, temp_c: '41' }],
      ['A bad id', { ...a, bat_id: 'XYZ-1' }],
      ['A NaN', { ...a, amb_c: Number.NaN }],
      ['B bad timestamp', { ...encodeBrandB(sample({ brand: 'B', batteryId: 'B-0001' })), timestamp: 'yesterday' }],
      ['B missing section', { device: { id: 'db_0001' }, pack: {} }],
      ['C wrong length', ['C1', 1, 2, 3]],
    ];
    for (const [label, raw] of cases) {
      const res = normalize(raw);
      expect(res.ok, label).toBe(false);
      if (!res.ok) expect(res.error.code, label).toBe('malformed');
    }
  });

  it('flags physically implausible readings as out_of_range (stuck or broken sensor)', () => {
    const a = encodeBrandA(sample());
    for (const bad of [{ temp_c: 900 }, { soc_pct: 140 }, { cells_mv: [3700, 9000] }, { i_a: 5000 }]) {
      const res = normalize({ ...a, ...bad });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error.code).toBe('out_of_range');
    }
  });

  it('validates canonical records', () => {
    expect(telemetryIssues(sample())).toEqual([]);
    expect(telemetryIssues(sample({ cellVoltages: [] }))).not.toEqual([]);
    expect(telemetryIssues(sample({ batteryId: 'nope' }))).not.toEqual([]);
  });
});
