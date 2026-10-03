import { describe, expect, it } from 'vitest';
import {
  NO_CONTROL,
  cloneBattery,
  createFleet,
  stepBattery,
  steadyStateTempC,
  thermalStep,
  timeConstantS,
  VEHICLE,
} from '@/sim';

const C = 7000;
const HA = 3;

describe('lumped thermal model', () => {
  it('settles at T_amb + Q / hA', () => {
    let t = 30;
    const tau = timeConstantS(C, HA);
    for (let i = 0; i < 200; i++) t = thermalStep(t, 90, 35, tau / 10, C, HA).tempC;
    expect(t).toBeCloseTo(steadyStateTempC(35, 90, HA), 6);
    expect(steadyStateTempC(35, 90, HA)).toBeCloseTo(35 + 30, 12);
  });

  it('closes 63.2 % of the gap to steady state in one time constant', () => {
    const tau = timeConstantS(C, HA);
    const { tempC } = thermalStep(30, 90, 35, tau, C, HA);
    const tSs = steadyStateTempC(35, 90, HA);
    expect((tempC - 30) / (tSs - 30)).toBeCloseTo(1 - Math.exp(-1), 9);
  });

  it('is exact for any step length', () => {
    let fine = 30;
    for (let i = 0; i < 1000; i++) fine = thermalStep(fine, 120, 40, 5, C, HA).tempC; // 5000 s
    expect(thermalStep(30, 120, 40, 5000, C, HA).tempC).toBeCloseTo(fine, 9);
  });

  it('conserves energy: heat generated minus heat shed equals C * dT', () => {
    let t = 38;
    const t0 = t;
    let generated = 0;
    let shed = 0;
    for (let i = 0; i < 720; i++) {
      const q = 40 + 120 * Math.abs(Math.sin(i / 17)); // varying load
      const amb = 33 + 6 * Math.sin(i / 300); // varying weather
      const step = thermalStep(t, q, amb, 5, C, HA);
      generated += q * 5;
      shed += HA * (step.meanTempC - amb) * 5;
      t = step.tempC;
    }
    expect(generated - shed).toBeCloseTo(C * (t - t0), 4);
  });

  it('a fault heat source raises the steady state by exactly Q_fault / hA', () => {
    const base = steadyStateTempC(40, 50, HA);
    expect(steadyStateTempC(40, 50 + 36, HA) - base).toBeCloseTo(36 / HA, 12);
  });
});

describe('derating the discharge power by 15 %', () => {
  it('cuts discharge current by 15 %, Joule heat by about 1 - 0.85^2 = 27.75 %, and ends cooler', () => {
    const fleet = createFleet({ seed: 5, n: 1, scenario: 'heavyClimb' });
    const normal = fleet.batteries[0];
    const derated = cloneBattery(normal);
    // Identical random streams: the requested current is identical, only the control differs.
    let heatNormal = 0;
    let heatDerated = 0;
    let discharging = 0;
    const t0 = normal.coreTempC;
    // Ticks where the BMS current limit clips the request are excluded from the ratio check.
    const unclipped = 0.85 * VEHICLE.maxDischargeC * normal.config.groupCapacityAh;
    for (let i = 0; i < 360; i++) {
      stepBattery(normal, fleet.env, NO_CONTROL);
      stepBattery(derated, fleet.env, { derate: 0.15, chargeCurrentScale: 1 });
      if (normal.currentA > 1 && normal.currentA < unclipped) {
        discharging++;
        expect(derated.currentA / normal.currentA).toBeGreaterThan(0.83);
        expect(derated.currentA / normal.currentA).toBeLessThan(0.87);
        heatNormal += normal.currentA ** 2;
        heatDerated += derated.currentA ** 2;
      }
    }
    expect(discharging).toBeGreaterThan(100);
    expect(heatDerated / heatNormal).toBeCloseTo(0.85 ** 2, 1);
    expect(derated.coreTempC - t0).toBeLessThan(normal.coreTempC - t0);
  });
});
