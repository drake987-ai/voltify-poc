import { describe, expect, it } from 'vitest';
import { runAB, type ABResult } from '@/eval/timeline';
import { resolveScenario } from '@/sim';
import {
  DEFAULT_SANDBOX,
  PRESETS,
  PRESET_IDS,
  SANDBOX_RANGES,
  applyPreset,
  sandboxSpec,
  scenarioOf,
  type SandboxParams,
} from '@/pages/sandbox/scenario';

const run = (over: Partial<SandboxParams> = {}): ABResult => runAB(sandboxSpec({ ...DEFAULT_SANDBOX, ...over }));
const peak = (r: ABResult) => r.bms.summary.peakTempC;

describe('the sliders become a scenario', () => {
  it('maps each slider to the scenario field it names', () => {
    const s = scenarioOf({ ...DEFAULT_SANDBOX, ambientPeakC: 43, payloadKg: 80, climbGradePct: 8, climbDutyPct: 60, sohPct: 70, coolingScale: 0.5 });
    expect(s.env).toEqual({ ambientMinC: 31, ambientMaxC: 43 });
    expect(s.load).toMatchObject({ payloadKg: 80, climbGrade: 0.08, climbDuty: 0.6, autoCharge: false });
    expect(s.soh).toBe(0.7);
    expect(s.coolingScale).toBe(0.5);
    expect(s.weakCell).toBeUndefined();
    expect(s.fault).toBeUndefined();
  });

  it('adds the weak cell and the internal short only when asked, with the severity of the Evidence screen', () => {
    const s = scenarioOf({ ...DEFAULT_SANDBOX, weakCell: true, short: { on: true, onsetMin: 12, severity: 'moderate' } });
    expect(s.weakCell).toEqual({ capScale: 0.82, r0Scale: 1.7 });
    expect(s.fault).toMatchObject({ onsetS: 720, rShortOhm0: 20, rShortMinOhm: 0.25, tauS: 600 });
  });

  it('keeps anything out of range inside the range (a typed or pasted value cannot break the simulator)', () => {
    const s = scenarioOf({ ...DEFAULT_SANDBOX, ambientPeakC: 500, payloadKg: -5, sohPct: 1000, coolingScale: 0, short: { on: true, onsetMin: -3, severity: 'mild' } });
    expect(s.env!.ambientMaxC).toBe(SANDBOX_RANGES.ambientPeakC.max);
    expect(s.load!.payloadKg).toBe(0);
    expect(s.soh).toBe(1);
    expect(s.coolingScale).toBe(SANDBOX_RANGES.coolingScale.min);
    expect(s.fault!.onsetS).toBe(SANDBOX_RANGES.onsetMin.min * 60);
    expect(sandboxSpec({ ...DEFAULT_SANDBOX, seed: 0 }).seed).toBe(SANDBOX_RANGES.seed.min);
  });

  it('is accepted by the simulator as a scenario and survives a structured clone', () => {
    const spec = sandboxSpec(DEFAULT_SANDBOX);
    expect(() => structuredClone(spec)).not.toThrow();
    expect(resolveScenario(spec.scenario).id).toBe('sandbox');
  });

  it('turns every preset into a valid run', () => {
    for (const id of PRESET_IDS) {
      const p = applyPreset(id);
      expect(p.seed).toBe(DEFAULT_SANDBOX.seed);
      expect(() => scenarioOf(p)).not.toThrow();
    }
    expect(PRESETS.ordinary).toEqual({});
  });

  it('keeps the viewer\'s brand, seed and intervention when a preset is applied, and clears the rest', () => {
    const touched: SandboxParams = { ...DEFAULT_SANDBOX, brand: 'C', seed: 77, intervention: 'derateOnly', payloadKg: 100, weakCell: true };
    const p = applyPreset('heatwave43', touched);
    expect(p).toMatchObject({ brand: 'C', seed: 77, intervention: 'derateOnly', ambientPeakC: 43, payloadKg: DEFAULT_SANDBOX.payloadKg, weakCell: false });
  });
});

describe('the runs obey the physics the sliders stand for', () => {
  it('a hotter day, a heavier load, a more aged pack and poorer cooling each make the pack hotter', () => {
    const base = peak(run());
    expect(peak(run({ ambientPeakC: 43 }))).toBeGreaterThan(base + 1);
    expect(peak(run({ payloadKg: 100, climbGradePct: 8, climbDutyPct: 60 }))).toBeGreaterThan(base + 1);
    expect(peak(run({ sohPct: 70 }))).toBeGreaterThan(base);
    expect(peak(run({ coolingScale: 0.3 }))).toBeGreaterThan(base + 1);
  });

  it('an ordinary day is quiet: no alert and the two sides identical', () => {
    const r = run();
    expect(r.voltify.summary.alertS).toBeNull();
    expect(r.bms.summary.bmsTripS).toBeNull();
    expect(JSON.stringify(r.bms.frames.map((f) => f.telemetry))).toBe(JSON.stringify(r.voltify.frames.map((f) => f.telemetry)));
  });

  it('an injected internal short is seen by Voltify, and the pack heats from the short (ground truth)', () => {
    const r = run({ short: { on: true, onsetMin: 10, severity: 'severe' } });
    expect(r.voltify.summary.alertS).not.toBeNull();
    expect(r.voltify.summary.alertS!).toBeGreaterThan(10 * 60);
    expect(Math.max(...r.bms.frames.map((f) => f.truth.qFaultW))).toBeGreaterThan(20);
  });

  it('the worst-day preset reproduces the BMS-vs-Voltify result: the BMS trips, Voltify alerts first and does not trip', () => {
    const r = run(applyPreset('worst'));
    expect(r.bms.summary.bmsTripS).not.toBeNull();
    expect(r.voltify.summary.alertS!).toBeLessThan(r.bms.summary.bmsTripS!);
    expect(r.voltify.summary.bmsTripS).toBeNull();
    expect(r.leadTimeS!).toBeGreaterThan(5 * 60);
  });

  it('is repeatable: the same sliders and seed give the same run, another seed another run', () => {
    expect(JSON.stringify(run({ payloadKg: 60 }))).toBe(JSON.stringify(run({ payloadKg: 60 })));
    expect(JSON.stringify(run({ payloadKg: 60, seed: 5 }))).not.toBe(JSON.stringify(run({ payloadKg: 60 })));
  });
});
