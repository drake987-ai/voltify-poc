import { describe, expect, it } from 'vitest';
import {
  BASE_ENV,
  SCENARIOS,
  SCENARIO_IDS,
  ambientAt,
  createFleet,
  resolveScenario,
  stepFleet,
  truthOf,
  type ScenarioId,
} from '@/sim';

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

/** Run a 30 min fleet and report the mean riding current, mean cell spread (V) and mean true R0. */
function profile(scenario: ScenarioId) {
  const fleet = createFleet({ seed: 8, n: 30, scenario });
  const currents: number[] = [];
  const spreads: number[] = [];
  for (let i = 0; i < 360; i++) {
    stepFleet(fleet);
    for (const b of fleet.batteries) {
      if (b.mode === 'riding' && b.currentA > 0) currents.push(b.currentA);
      spreads.push(Math.max(...b.cellVoltagesV) - Math.min(...b.cellVoltagesV));
    }
  }
  return {
    fleet,
    meanCurrent: mean(currents),
    meanSpread: mean(spreads),
    meanR0: mean(fleet.batteries.map((b) => truthOf(b).r0PackOhm)),
    meanSoh: mean(fleet.batteries.map((b) => b.soh)),
  };
}

describe('scenario definitions', () => {
  it('defines every id', () => {
    for (const id of SCENARIO_IDS) expect(SCENARIOS[id].id).toBe(id);
  });

  it('composes scenarios field by field (later wins, load merges)', () => {
    const merged = resolveScenario(['agedHigh', 'heavyClimb', 'internalShort']);
    expect(merged.id).toBe('agedHigh+heavyClimb+internalShort');
    expect(merged.soh).toBe(0.72);
    expect(merged.load?.payloadKg).toBe(70);
    expect(merged.fault?.onsetS).toBe(600);
    const worst = resolveScenario(['overheatLoad', 'heavyClimb']);
    expect(worst.load?.climbGrade).toBe(0.06); // heavyClimb overrides overheatLoad's 7 %
    expect(worst.load?.speedScale).toBe(1.15); // but keeps keys it does not mention
    expect(worst.coolingScale).toBe(0.45);
  });
});

describe('weather', () => {
  it('peaks at 15:00 local and bottoms out at 03:00', () => {
    const env = { ...SCENARIOS.heatwave43.env!, offsetC: 0 };
    expect(ambientAt(env, 3 * 3600)).toBeCloseTo(43, 9); // 12:00 start + 3 h = 15:00
    expect(ambientAt(env, 15 * 3600)).toBeCloseTo(31, 9); // 03:00 next day
    expect(ambientAt({ ...BASE_ENV, offsetC: 0 }, 3 * 3600)).toBeCloseTo(35, 9);
  });

  it('heatwave43 is hotter than baseline at the same hour, and the Sandbox offset shifts it', () => {
    const hot = createFleet({ seed: 1, n: 1, scenario: 'heatwave43', startLocalHour: 15 });
    const base = createFleet({ seed: 1, n: 1, startLocalHour: 15 });
    stepFleet(hot);
    stepFleet(base);
    expect(hot.batteries[0].ambientC).toBeGreaterThan(base.batteries[0].ambientC + 6);
    hot.env.offsetC = 5;
    stepFleet(hot);
    expect(hot.batteries[0].ambientC).toBeGreaterThan(48 - 1.5);
  });
});

describe('scenario effects', () => {
  const base = profile('baseline');

  it('heavyClimb draws much more current than baseline', () => {
    expect(profile('heavyClimb').meanCurrent).toBeGreaterThan(1.3 * base.meanCurrent);
  });

  it('cellImbalance widens the voltage spread between cells', () => {
    expect(profile('cellImbalance').meanSpread).toBeGreaterThan(base.meanSpread + 0.01);
  });

  it('agedHigh has low SOH and much higher internal resistance', () => {
    const aged = profile('agedHigh');
    expect(aged.meanSoh).toBeLessThan(0.73);
    expect(aged.meanSoh).toBeLessThan(base.meanSoh);
    expect(aged.meanR0).toBeGreaterThan(1.3 * base.meanR0);
  });

  it('internalShort changes nothing but the fault: ordinary state is untouched before onset', () => {
    const control = createFleet({ seed: 8, n: 5 });
    const faulty = createFleet({ seed: 8, n: 5, scenario: 'internalShort' });
    for (let i = 0; i < 100; i++) {
      stepFleet(control);
      stepFleet(faulty);
    }
    expect(faulty.batteries.map((b) => JSON.stringify(b.reading))).toEqual(
      control.batteries.map((b) => JSON.stringify(b.reading)),
    ); // 500 s: the short only starts at 600 s
  });
});
