import { describe, expect, it } from 'vitest';
import { normalize, type Brand } from '@/adapters';
import {
  BRAND_SPECS,
  CELL,
  CITY_BOX,
  SIM,
  createFleet,
  findBattery,
  stepFleet,
  type FleetState,
} from '@/sim';

const stream = (fleet: FleetState, ticks: number) => {
  const out: string[] = [];
  for (let i = 0; i < ticks; i++) for (const f of stepFleet(fleet).frames) out.push(JSON.stringify(f.payload));
  return out;
};

describe('fleet determinism', () => {
  it('replays the exact same vendor stream from the same seed', () => {
    const a = stream(createFleet({ seed: 99, n: 30 }), 120);
    const b = stream(createFleet({ seed: 99, n: 30 }), 120);
    expect(a.length).toBeGreaterThan(1000);
    expect(a).toEqual(b);
  });

  it('produces a different stream from a different seed', () => {
    expect(stream(createFleet({ seed: 99, n: 30 }), 40)).not.toEqual(stream(createFleet({ seed: 100, n: 30 }), 40));
  });

  it('evolves battery #12 identically in a fleet of 50 and a fleet of 300', () => {
    const small = createFleet({ seed: 5, n: 50 });
    const large = createFleet({ seed: 5, n: 300 });
    for (let i = 0; i < 200; i++) {
      stepFleet(small);
      stepFleet(large);
    }
    const id = small.batteries[11].config.id;
    expect(findBattery(large, id)).toBeDefined();
    expect(JSON.stringify(findBattery(large, id)!.reading)).toBe(JSON.stringify(findBattery(small, id)!.reading));
  });
});

describe('fleet composition', () => {
  it('gives every battery a unique id of the form <brand>-<4 digits>', () => {
    const fleet = createFleet({ seed: 3, n: 300 });
    const ids = fleet.batteries.map((b) => b.config.id);
    expect(new Set(ids).size).toBe(300);
    for (const id of ids) expect(id).toMatch(/^[ABC]-\d{4}$/);
  });

  it('follows the requested brand mix', () => {
    const fleet = createFleet({ seed: 3, n: 600, brandMix: [0.5, 0.3, 0.2] });
    const share = (brand: Brand) => fleet.batteries.filter((b) => b.config.brand === brand).length / 600;
    expect(Math.abs(share('A') - 0.5)).toBeLessThan(0.06);
    expect(Math.abs(share('B') - 0.3)).toBeLessThan(0.06);
    expect(Math.abs(share('C') - 0.2)).toBeLessThan(0.06);
  });

  it('keeps every vehicle inside its city box, in both cities', () => {
    const fleet = createFleet({ seed: 4, n: 60, city: 'both' });
    const cities = new Set(fleet.batteries.map((b) => b.config.city));
    expect(cities).toEqual(new Set(['hcmc', 'hanoi']));
    for (let i = 0; i < 200; i++) stepFleet(fleet);
    for (const b of fleet.batteries) {
      const box = CITY_BOX[b.config.city];
      expect(b.reading.lat).toBeGreaterThanOrEqual(box.latMin - 1e-6);
      expect(b.reading.lat).toBeLessThanOrEqual(box.latMax + 1e-6);
      expect(b.reading.lng).toBeGreaterThanOrEqual(box.lngMin - 1e-6);
      expect(b.reading.lng).toBeLessThanOrEqual(box.lngMax + 1e-6);
    }
  });
});

describe('telemetry cadence', () => {
  it('advances 5 simulated seconds per tick', () => {
    const fleet = createFleet({ seed: 1, n: 3 });
    const first = stepFleet(fleet);
    const second = stepFleet(fleet);
    expect(second.tsMs - first.tsMs).toBe(SIM.tickS * 1000);
    expect(fleet.tick).toBe(2);
  });

  it('emits brand A every 5 s, B every 10 s and C every 15 s (1:2:3 ticks)', () => {
    const fleet = createFleet({ seed: 6, n: 90 });
    const counts = new Map<string, number>();
    const TICKS = 360;
    for (let i = 0; i < TICKS; i++) {
      for (const f of stepFleet(fleet).frames) counts.set(f.batteryId, (counts.get(f.batteryId) ?? 0) + 1);
    }
    for (const b of fleet.batteries) {
      const expected = TICKS / BRAND_SPECS[b.config.brand].emitEveryTicks;
      expect(Math.abs((counts.get(b.config.id) ?? 0) - expected)).toBeLessThanOrEqual(1);
    }
    expect(BRAND_SPECS.A.emitEveryTicks * SIM.tickS).toBe(5);
    expect(BRAND_SPECS.B.emitEveryTicks * SIM.tickS).toBe(10);
    expect(BRAND_SPECS.C.emitEveryTicks * SIM.tickS).toBe(15);
  });

  it('puts only vendor payloads on the wire: ground truth never leaves the simulator', () => {
    const fleet = createFleet({ seed: 6, n: 30, scenario: 'internalShort' });
    for (let i = 0; i < 150; i++) {
      for (const f of stepFleet(fleet).frames) {
        const text = JSON.stringify(f.payload).toLowerCase();
        for (const secret of ['soh', 'qfault', 'shortcurrent', 'r0', 'fault', 'bmstripped']) {
          expect(text).not.toContain(secret);
        }
        const res = normalize(f.payload);
        expect(res.ok).toBe(true);
      }
    }
  });
});

describe('physical consistency', () => {
  it('conserves charge: the SOC change matches the integral of the pack current', () => {
    const fleet = createFleet({ seed: 14, n: 1 });
    const b = fleet.batteries[0];
    const meanSoc = () => b.cellSoc.reduce((s, x) => s + x, 0) / CELL.seriesCells;
    const soc0 = meanSoc();
    let ampHours = 0;
    for (let i = 0; i < 240; i++) {
      stepFleet(fleet);
      ampHours += (b.currentA * SIM.tickS) / 3600;
    }
    const meanCapVar = b.config.capVar.reduce((s, x) => s + x, 0) / CELL.seriesCells;
    const capacityAh = b.config.groupCapacityAh * b.soh * meanCapVar;
    expect(ampHours).toBeGreaterThan(0.5); // the run actually moved charge
    expect(Math.abs(soc0 - meanSoc() - ampHours / capacityAh)).toBeLessThan(0.002);
  });

  it('rides, then charges when nearly empty, then parks, and charging current is negative', () => {
    const fleet = createFleet({ seed: 14, n: 1, scenario: 'baseline' });
    const b = fleet.batteries[0];
    b.cellSoc.fill(0.115); // nearly empty
    const modes: string[] = [];
    let chargingCurrents = 0;
    let maxSoc = 0;
    for (let i = 0; i < 2600; i++) {
      stepFleet(fleet);
      if (modes[modes.length - 1] !== b.mode) modes.push(b.mode);
      if (b.mode === 'charging' && b.currentA < 0) chargingCurrents++;
      maxSoc = Math.max(maxSoc, b.cellSoc.reduce((s, x) => s + x, 0) / CELL.seriesCells);
    }
    expect(modes.slice(0, 3)).toEqual(['riding', 'charging', 'idle']);
    expect(chargingCurrents).toBeGreaterThan(500);
    expect(maxSoc).toBeGreaterThan(0.97);
  });

  it('tapers the charge: current falls once cells approach 4.2 V', () => {
    const fleet = createFleet({ seed: 14, n: 1 });
    const b = fleet.batteries[0];
    b.cellSoc.fill(0.115);
    let peak = 0;
    let last = 0;
    for (let i = 0; i < 2600; i++) {
      stepFleet(fleet);
      if (b.mode === 'charging') {
        peak = Math.max(peak, -b.currentA);
        last = -b.currentA;
      }
    }
    expect(peak).toBeGreaterThan(5);
    expect(last).toBeLessThan(0.5 * peak);
  });
});
