import { describe, expect, it } from 'vitest';
import {
  AI_CONFIG,
  initVoltage,
  stepVoltage,
  voltageSeverity,
  type VoltageOutput,
  type VoltageState,
} from '@/ai';
import { synthCells, type CellSynthOptions } from './helpers';

/** Run the voltage module over synthetic cells; returns the output (with persistence applied) per frame. */
function run(opts: CellSynthOptions) {
  const data = synthCells(opts);
  let s: VoltageState | null = null;
  const outs: { tS: number; o: VoltageOutput; severity: ReturnType<typeof voltageSeverity> }[] = [];
  for (const d of data) {
    if (s === null) s = initVoltage(d.ts);
    const o = stepVoltage(s, d.ts, d.cells, d.current, d.soc);
    outs.push({ tS: d.ts, o, severity: voltageSeverity(o) });
  }
  return outs;
}

const cfg = AI_CONFIG.voltage;

describe('voltage anomaly', () => {
  it('does not mistake the load-dependent sag of a healthy pack for a fault', () => {
    for (const seed of [1, 2, 3, 4]) {
      const outs = run({ durationS: 3600, seed });
      const learned = outs.filter((x) => x.tS >= 600);
      expect(Math.max(...learned.map((x) => x.severity.total)), `seed ${seed}`).toBeLessThan(0.1);
    }
  });

  it('finds a cell that leaks charge at any current, names it, and counts it fully once persistent', () => {
    const outs = run({ durationS: 3600, leak: { cell: 6, ratePerS: 0.00006, startS: 900 }, seed: 5 }); // 0.36 %/min
    const hit = outs.find((x) => x.severity.total > 0.5);
    expect(hit).toBeDefined();
    expect(hit!.tS).toBeGreaterThan(900);
    expect(hit!.o.worstCell).toBe(6);
    expect(hit!.o.sagSocPct).toBeGreaterThan(cfg.sagWarnPct);
    // Before the leak starts nothing is flagged.
    expect(Math.max(...outs.filter((x) => x.tS >= 600 && x.tS < 900).map((x) => x.severity.total))).toBeLessThan(0.1);
  });

  it('treats a high-resistance cell as a capped maintenance finding, not a fire signal', () => {
    const r = Array.from({ length: 16 }, () => 0.0032);
    r[9] = 0.0032 + 0.0022; // +2.2 mOhm
    const outs = run({ durationS: 3600, resistances: r, seed: 6 });
    const late = outs.filter((x) => x.tS >= 1800);
    const o = late[late.length - 1].o;
    expect(o.weakCell).toBe(9);
    expect(o.weakExcessMOhm).toBeGreaterThan(1.4);
    expect(o.weakExcessMOhm).toBeLessThan(3.0);
    const sev = late[late.length - 1].severity;
    expect(sev.weak).toBeGreaterThan(0.2);
    expect(sev.weak).toBeLessThanOrEqual(cfg.weakSeverityCap + 1e-9);
    expect(Math.max(...late.map((x) => x.severity.sag))).toBeLessThan(0.1); // the current-dependent part is removed
  });

  it('judges imbalance in equivalent % SOC, so the steep OCV near empty does not raise false alarms', () => {
    // The same 0.5 % SOC offset on one cell gives a much bigger voltage gap at 6 % SOC than at 60 %.
    const offsets = Array.from({ length: 16 }, () => 0);
    offsets[3] = -0.005;
    const low = run({ durationS: 1800, startSoc: 0.07, socOffsets: offsets, seed: 7 });
    const mid = run({ durationS: 1800, startSoc: 0.6, socOffsets: offsets, seed: 7 });
    const lowMv = low[low.length - 1].o.sagMv;
    const midMv = mid[mid.length - 1].o.sagMv;
    expect(lowMv).toBeGreaterThan(1.8 * midMv); // raw voltage gap is much larger at low SOC
    expect(low[low.length - 1].o.sagSocPct).toBeLessThan(cfg.sagWarnPct); // but it is only a ~0.5 % imbalance
    expect(Math.max(...low.filter((x) => x.tS > 600).map((x) => x.severity.total))).toBeLessThan(0.1);
  });

  it('flags a cell outside the absolute voltage limits at once, without waiting to learn', () => {
    const data = synthCells({ durationS: 60, seed: 8 });
    const s = initVoltage(data[0].ts);
    const cells = [...data[0].cells];
    cells[2] = 2.7;
    const o = stepVoltage(s, data[0].ts, cells, data[0].current, data[0].soc);
    expect(o.minCellV).toBeLessThan(cfg.minCellV);
    expect(voltageSeverity(o).limit).toBe(1);
  });

  it('ignores a one-frame glitch: evidence has to persist', () => {
    const data = synthCells({ durationS: 2400, seed: 9 });
    let s: VoltageState | null = null;
    let worst = 0;
    data.forEach((d, i) => {
      const cells = [...d.cells];
      if (i === 400) cells[5] -= 0.3; // one wild reading
      if (s === null) s = initVoltage(d.ts);
      const o = stepVoltage(s, d.ts, cells, d.current, d.soc);
      if (d.ts > 600) worst = Math.max(worst, voltageSeverity(o).total);
    });
    expect(worst).toBeLessThan(0.3);
  });

  it('copes with the sparser cadence of the other vendors (10 s and 15 s)', () => {
    for (const dtS of [10, 15]) {
      const healthy = run({ durationS: 3600, dtS, seed: 10 });
      expect(Math.max(...healthy.filter((x) => x.tS >= 900).map((x) => x.severity.total)), `${dtS} s healthy`).toBeLessThan(0.1);
      const leaking = run({ durationS: 3600, dtS, leak: { cell: 11, ratePerS: 0.00006, startS: 900 }, seed: 10 });
      const hit = leaking.find((x) => x.severity.total > 0.5);
      expect(hit, `${dtS} s leak`).toBeDefined();
      expect(hit!.o.worstCell).toBe(11);
    }
  });
});
