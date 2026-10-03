import { describe, expect, it } from 'vitest';
import { AGE_GAMMA, sohFromTheta } from '@/ai';
import { PCOE_CELLS, PCOE_DATA, PCOE_SOURCE } from '@/data/nasaPcoe';
import { analyseRealSoh, estimateSoh, fitGamma, type RealSohPoint } from '@/eval/realSoh';

const result = analyseRealSoh();
const cell = (name: string) => result.cells.find((c) => c.cell === name)!;

describe('the NASA PCoE data as shipped', () => {
  it('holds the four cells with the cycle counts of the original experiment', () => {
    expect(PCOE_CELLS).toEqual(['B0005', 'B0006', 'B0007', 'B0018']);
    expect(PCOE_DATA.B0005.capacity).toHaveLength(168);
    expect(PCOE_DATA.B0006.capacity).toHaveLength(168);
    expect(PCOE_DATA.B0007.capacity).toHaveLength(168);
    expect(PCOE_DATA.B0018.capacity).toHaveLength(132);
    expect(PCOE_DATA.B0005.impedance).toHaveLength(278);
    expect(PCOE_DATA.B0018.impedance).toHaveLength(52);
  });

  it('is physically sensible: capacities near the rated 2 Ah when new, running down to end of life', () => {
    for (const c of PCOE_CELLS) {
      const caps = PCOE_DATA[c].capacity;
      expect(caps[0][1], c).toBeGreaterThan(1.8);
      expect(caps[0][1], c).toBeLessThan(2.1);
      // The experiment stopped at about a 30 % fade of the 2 Ah rating (1.4 Ah).
      expect(caps[caps.length - 1][1], c).toBeLessThan(1.5);
      expect(caps[caps.length - 1][1], c).toBeLessThan(caps[0][1]);
      for (const [, cap] of caps) expect(cap).toBeGreaterThan(0.5);
      for (const [, cap, re, rct] of PCOE_DATA[c].impedance) {
        expect(cap).toBeGreaterThan(0.5);
        expect(re).toBeGreaterThan(0.01);
        expect(rct).toBeGreaterThan(0.01);
        expect(re + rct).toBeLessThan(0.5);
      }
    }
    expect(PCOE_SOURCE.endOfLifeAh / PCOE_SOURCE.ratedAh).toBeCloseTo(0.7, 9);
  });

  it('credits the data donors, as NASA asks', () => {
    expect(PCOE_SOURCE.citation).toContain('Saha');
    expect(PCOE_SOURCE.citation).toContain('Goebel');
    expect(PCOE_SOURCE.url).toContain('nasa.gov');
  });
});

describe('the resistance-to-SOH law of the module', () => {
  it('is the module\'s own function: a new cell reads 100 %, and a larger gamma reads less loss', () => {
    expect(estimateSoh({ cycle: 1, soh: 1, ratio: 1 }, 4)).toBe(1);
    expect(estimateSoh({ cycle: 1, soh: 0.9, ratio: 1.8 }, AGE_GAMMA)).toBe(sohFromTheta(1.8));
    expect(sohFromTheta(1.8, 1)).toBeLessThan(sohFromTheta(1.8, 4));
    expect(sohFromTheta(1.8, 4)).toBeCloseTo(0.8, 9);
  });

  it('recovers the constant from data that follow the law exactly', () => {
    const exact: RealSohPoint[] = [0.95, 0.9, 0.85, 0.8, 0.75].map((soh, i) => ({ cycle: i, soh, ratio: 1 + 2.5 * (1 - soh) }));
    expect(fitGamma(exact)).toBeCloseTo(2.5, 9);
  });
});

describe('the module\'s law tested on the real cells', () => {
  it('uses the module\'s own ageing constant', () => {
    expect(result.moduleGamma).toBe(AGE_GAMMA);
    expect(result.cells.map((c) => c.cell)).toEqual([...PCOE_CELLS]);
  });

  it('summarises each cell from its own data', () => {
    for (const c of result.cells) {
      expect(c.discharges).toBe(PCOE_DATA[c.cell].capacity.length);
      expect(c.impedanceCount).toBe(PCOE_DATA[c.cell].impedance.length);
      expect(result.points[c.cell]).toHaveLength(c.impedanceCount);
      expect(c.fadePct).toBeCloseTo((1 - c.capEndAh / c.cap0Ah) * 100, 9);
      expect(c.fadePct).toBeGreaterThan(20);
    }
    // Every cell's capacity fades; the SOH series starts at 1.
    for (const name of PCOE_CELLS) expect(result.capacitySoh[name][0][1]).toBe(1);
  });

  it('finds that the real cells\' resistance rises far less than the simulator assumes', () => {
    // The simulator says R grows 4 x as fast as SOH falls; the three cells with a full set of measurements say about 0.5 to 1.5.
    for (const name of ['B0005', 'B0006', 'B0007']) {
      expect(cell(name).gammaOwn, name).toBeGreaterThan(0.3);
      expect(cell(name).gammaOwn, name).toBeLessThan(2);
      expect(cell(name).gammaOwn, name).toBeLessThan(AGE_GAMMA / 2);
    }
    expect(cell('B0018').r2Own).toBeLessThan(0.5); // too few, inconsistent measurements to follow any law
  });

  it('so the module\'s SOH is far off on real cells: it misses by many points and barely beats assuming the cell is new', () => {
    for (const c of result.cells) {
      expect(c.maeModulePp, c.cell).toBeGreaterThan(8);
      // Never much better than the plainest guess ("still 100 %").
      expect(c.maeModulePp, c.cell).toBeGreaterThan(c.maeBaselinePp - 10);
      // ... and for one cell (B0018) it is no better at all.
      expect(c.maeModulePp, c.cell).toBeLessThanOrEqual(c.maeBaselinePp + 2);
    }
  });

  it('is not rescued by calibrating the constant on the other cells: out of sample it stays unreliable', () => {
    const errs = result.cells.map((c) => c.maeOthersPp);
    expect(Math.max(...errs)).toBeGreaterThan(10);
    expect(errs.reduce((s, e) => s + e, 0) / errs.length).toBeGreaterThan(5);
    // The fitted constants, trained without the cell, are all well below the simulator's.
    for (const c of result.cells) expect(c.gammaOthers).toBeLessThan(AGE_GAMMA / 2);
  });

  it('is deterministic', () => {
    expect(JSON.stringify(analyseRealSoh())).toBe(JSON.stringify(result));
  });
});
