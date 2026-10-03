import { describe, expect, it } from 'vitest';
import type { Brand } from '@/adapters';
import { BMS, createFleet, stepFleet, type ScenarioSelection } from '@/sim';

const WORST_DAY: ScenarioSelection = ['overheatLoad', 'escalatingShort'];
const SEEDS = [42, 7, 123];
const BRANDS: Brand[] = ['A', 'B', 'C'];

function run(scenario: ScenarioSelection, seed: number, brand: Brand, minutes: number) {
  const fleet = createFleet({ seed, n: 24, scenario });
  const b = fleet.batteries.find((x) => x.config.brand === brand)!;
  const temps: number[] = [];
  const currents: number[] = [];
  const speeds: number[] = [];
  for (let i = 0; i < (minutes * 60) / 5; i++) {
    stepFleet(fleet);
    temps.push(b.coreTempC);
    currents.push(b.currentA);
    speeds.push(b.speedMs);
  }
  return { b, temps, currents, speeds };
}

describe('traditional BMS (passive cut-off at 65 degC)', () => {
  it.each(SEEDS.flatMap((seed) => BRANDS.map((brand) => [seed, brand] as const)))(
    'trips on the worst day (seed %i, brand %s), cuts the current and stops the bike',
    (seed, brand) => {
      const { b, temps, currents, speeds } = run(WORST_DAY, seed, brand, 90);
      expect(b.bmsTrippedAtS).not.toBeNull();
      const k = Math.round(b.bmsTrippedAtS! / 5) - 1; // index of the tick that crossed the limit
      expect(temps[k]).toBeGreaterThanOrEqual(BMS.tripTempC);
      expect(temps[k - 1]).toBeLessThan(BMS.tripTempC);
      // From the next tick on the contactor is open until the pack cools below the release point.
      expect(currents[k + 1]).toBe(0);
      expect(speeds[k + 1]).toBe(0);
    },
  );

  it('cannot stop an internal short: the pack keeps heating after the cut-off', () => {
    for (const seed of SEEDS) {
      const { b, temps } = run(WORST_DAY, seed, 'B', 90);
      const k = Math.round(b.bmsTrippedAtS! / 5) - 1;
      const window = temps.slice(k, k + 120); // next 10 minutes
      expect(Math.max(...window)).toBeGreaterThan(temps[k] + 0.2);
    }
  });

  it('does not trip on an ordinary day, nor on the worst-day load alone', () => {
    for (const seed of SEEDS) {
      for (const scenario of ['baseline', 'overheatLoad'] as const) {
        const { b } = run(scenario, seed, 'A', 120);
        expect(b.bmsTrippedAtS, `${scenario} seed ${seed}`).toBeNull();
      }
    }
  });
});
