import { describe, expect, it } from 'vitest';
import {
  createFleet,
  findBattery,
  injectFleetFault,
  stepFleet,
  truthOf,
  type BatteryState,
  type FaultSpec,
} from '@/sim';

const FAST_SHORT: Partial<FaultSpec> = { onsetS: 300, rShortOhm0: 20, rShortMinOhm: 0.08, tauS: 300 };
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

/** How far the faulty cell's voltage sits below the mean of the other cells. */
const sag = (b: BatteryState, cell: number) =>
  mean(b.cellVoltagesV.filter((_, i) => i !== cell)) - b.cellVoltagesV[cell];

describe('internal short', () => {
  it('drains and heats the faulty pack compared with an identical healthy twin', () => {
    const opts = { seed: 31, n: 6 } as const;
    const healthy = createFleet(opts);
    const faulty = createFleet(opts);
    const id = faulty.batteries[0].config.id;
    injectFleetFault(faulty, id, FAST_SHORT);
    const a = findBattery(healthy, id)!;
    const b = findBattery(faulty, id)!;
    const cell = b.fault!.cell;

    for (let i = 0; i < 360; i++) {
      stepFleet(healthy);
      stepFleet(faulty);
    }

    // Voltage: the shorted cell group sits well below its neighbours (> 25x sensor noise of 0.8 mV).
    expect(sag(b, cell) - sag(a, cell)).toBeGreaterThan(0.02);
    // Charge: it has lost far more state of charge than the same cell in the healthy twin.
    expect(a.cellSoc[cell] - b.cellSoc[cell]).toBeGreaterThan(0.05);
    // Heat: the pack is hotter than the healthy twin.
    expect(b.coreTempC - a.coreTempC).toBeGreaterThan(2);
    // The other cells are barely affected.
    const other = (cell + 5) % 16;
    expect(Math.abs(a.cellSoc[other] - b.cellSoc[other])).toBeLessThan(0.01);
  });

  it('releases no fault heat before onset, then ramps up as the short resistance falls', () => {
    const fleet = createFleet({ seed: 31, n: 2 });
    const id = fleet.batteries[0].config.id;
    injectFleetFault(fleet, id, FAST_SHORT);
    const b = findBattery(fleet, id)!;
    const qAt: number[] = [];
    for (let i = 0; i < 300; i++) {
      stepFleet(fleet);
      if (i === 50) expect(truthOf(b).qFaultW).toBe(0); // 250 s: before the 300 s onset
      if (i % 40 === 0) qAt.push(truthOf(b).qFaultW);
    }
    expect(truthOf(b).faultActive).toBe(true);
    const after = qAt.slice(Math.ceil(300 / 5 / 40));
    for (let i = 1; i < after.length; i++) expect(after[i]).toBeGreaterThanOrEqual(after[i - 1]);
    expect(after[after.length - 1]).toBeGreaterThan(10);
  });

  it('can be injected into any battery of a running fleet, and unknown ids are rejected', () => {
    const fleet = createFleet({ seed: 2, n: 10 });
    for (let i = 0; i < 20; i++) stepFleet(fleet);
    const id = fleet.batteries[7].config.id;
    expect(truthOf(findBattery(fleet, id)!).faultActive).toBe(false);
    expect(injectFleetFault(fleet, id)).toBe(true);
    expect(truthOf(findBattery(fleet, id)!).faultActive).toBe(true);
    expect(injectFleetFault(fleet, 'A-9999')).toBe(false);
  });
});

describe('paired runs (same seed, fault vs no fault)', () => {
  it('are bit-identical until the fault starts, then only the faulted battery diverges', () => {
    const opts = { seed: 11, n: 20 } as const;
    const control = createFleet(opts);
    const hit = createFleet(opts);
    const target = hit.batteries[3].config.id;
    injectFleetFault(hit, target, { onsetS: 600, rShortOhm0: 20, rShortMinOhm: 0.25, tauS: 1200 });

    const snapshot = (f: typeof control) => f.batteries.map((b) => JSON.stringify(b.reading));

    for (let tick = 1; tick <= 120; tick++) {
      stepFleet(control);
      stepFleet(hit);
      expect(snapshot(hit)).toEqual(snapshot(control)); // 600 s: still identical
    }

    let diverged = false;
    for (let tick = 121; tick <= 200; tick++) {
      stepFleet(control);
      stepFleet(hit);
      hit.batteries.forEach((b, i) => {
        const same = JSON.stringify(b.reading) === JSON.stringify(control.batteries[i].reading);
        if (b.config.id === target) diverged ||= !same;
        else expect(same).toBe(true); // other packs never change
      });
    }
    expect(diverged).toBe(true);
  });
});
