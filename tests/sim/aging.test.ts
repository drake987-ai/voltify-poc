import { describe, expect, it } from 'vitest';
import { AGING, arrheniusFactor, createFleet, fadePerEfc, projectLifetime, stepFleet } from '@/sim';

const R = 8.314462618;

describe('Arrhenius aging', () => {
  it('matches the closed form exp(Ea/R * (1/T_ref - 1/T))', () => {
    const expected = Math.exp((AGING.eaJPerMol / R) * (1 / 303.15 - 1 / 316.15));
    expect(arrheniusFactor(43, 30)).toBeCloseTo(expected, 12);
  });

  it('is 1 at the reference temperature and rises monotonically with temperature', () => {
    expect(arrheniusFactor(30, 30)).toBeCloseTo(1, 12);
    let prev = 0;
    for (let t = 10; t <= 60; t += 5) {
      const f = arrheniusFactor(t, 30);
      expect(f).toBeGreaterThan(prev);
      prev = f;
    }
  });

  it('ages a 43 degC pack about 1.39x faster than a 30 degC one (derived, not typed in)', () => {
    expect(fadePerEfc(43) / fadePerEfc(30)).toBeCloseTo(1.386, 2);
    expect(fadePerEfc(30)).toBeCloseTo(AGING.kRefPerEfc, 12);
  });

  it('a larger activation energy makes the heat penalty larger', () => {
    expect(fadePerEfc(43, 50_000) / fadePerEfc(30, 50_000)).toBeGreaterThan(fadePerEfc(43) / fadePerEfc(30));
  });
});

describe('lifetime projection', () => {
  it('needs 1000 equivalent cycles to reach 80 % SOH at 30 degC, fewer when hotter', () => {
    const cool = projectLifetime({ coreTempC: 30, efcPerDay: 1 });
    const hot = projectLifetime({ coreTempC: 43, efcPerDay: 1 });
    expect(cool.efcToEol).toBeCloseTo(1000, 6);
    expect(hot.efcToEol).toBeLessThan(cool.efcToEol);
    expect(hot.efcToEol).toBeCloseTo(1000 / 1.386, -1);
  });

  it('converts cycles to days from the daily cycle count', () => {
    const p = projectLifetime({ coreTempC: 30, efcPerDay: 2 });
    expect(p.daysToEol).toBeCloseTo(p.efcToEol / 2, 9);
    expect(projectLifetime({ coreTempC: 30, efcPerDay: 0 }).daysToEol).toBe(Infinity);
  });
});

describe('aging inside the simulator', () => {
  it('loses SOH at a rate per EFC bounded by the Arrhenius rates of the temperatures it saw', () => {
    const fleet = createFleet({ seed: 21, n: 1, scenario: 'heavyClimb' });
    const b = fleet.batteries[0];
    const soh0 = b.soh;
    const efc0 = b.efc;
    let tMin = b.coreTempC;
    let tMax = b.coreTempC;
    for (let i = 0; i < 720; i++) {
      stepFleet(fleet);
      tMin = Math.min(tMin, b.coreTempC);
      tMax = Math.max(tMax, b.coreTempC);
    }
    const perEfc = (soh0 - b.soh) / (b.efc - efc0);
    expect(b.efc).toBeGreaterThan(efc0);
    expect(perEfc).toBeGreaterThanOrEqual(fadePerEfc(tMin) * 0.999);
    expect(perEfc).toBeLessThanOrEqual(fadePerEfc(tMax) * 1.001);
  });
});
