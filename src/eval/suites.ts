// The list of simulated runs of the Evidence screen's batch evaluation, kept apart from the code that
// runs them so the page can show progress without loading the simulator and the AI engine.
import type { Brand } from '../adapters/schema';
import type { ScenarioSelection } from '../sim/scenarios';

/** Seeds of the evaluation (held out: the AI was tuned on 201-203). */
export const EVIDENCE_SEEDS = [301, 302, 303, 304] as const;
/** Seeds of the injected-short suite for the severe short (six per brand); the slower ones use the first four. */
export const SHORT_SEEDS = [301, 302, 303, 304, 305, 306] as const;

/** A pack whose core got this close to the BMS limit without the BMS tripping is a near miss, not a clear case. */
export const NEAR_MISS_C = 60;

export type SuiteKind = 'healthy' | 'maintenance' | 'overload' | 'short';

export interface SuiteSpec {
  id: string;
  kind: SuiteKind;
  /** Name of the scenario, used for grouping and display. */
  label: string;
  scenario: ScenarioSelection;
  seed: number;
  n: number;
  durationS: number;
  /** Injected-short suite: the brand of the pack that gets the short, when it starts and how severe it is. */
  short?: { brand: Brand; atS: number; severity: ShortSeverity };
}

/**
 * How hard an internal short bites. The resistance of the short falls from 20 ohm to `rShortMinOhm`
 * with time constant `tauS`: the lower it ends and the faster it falls, the more heat it makes.
 * The last one is deliberately at the edge of what can be seen (about 9 W at the end).
 */
export const SHORT_SEVERITIES = ['severe', 'moderate', 'mild', 'veryMild'] as const;
export type ShortSeverity = (typeof SHORT_SEVERITIES)[number];
export const SHORT_FAULTS: Record<ShortSeverity, { rShortOhm0: number; rShortMinOhm: number; tauS: number }> = {
  severe: { rShortOhm0: 20, rShortMinOhm: 0.08, tauS: 300 },
  moderate: { rShortOhm0: 20, rShortMinOhm: 0.25, tauS: 600 },
  mild: { rShortOhm0: 20, rShortMinOhm: 0.6, tauS: 900 },
  veryMild: { rShortOhm0: 20, rShortMinOhm: 1.5, tauS: 1200 },
};
const SHORT_DURATION_S: Record<ShortSeverity, number> = { severe: 4500, moderate: 6000, mild: 6000, veryMild: 6000 };
/** Seeds per brand for each severity (the severe short, the main case, gets the most). */
const SHORT_SEED_COUNT: Record<ShortSeverity, number> = { severe: 6, moderate: 4, mild: 4, veryMild: 4 };

export function evidenceSuites(): SuiteSpec[] {
  const suites: SuiteSpec[] = [];
  for (const label of ['baseline', 'heatwave43', 'heavyClimb', 'agedHigh'] as const) {
    for (const seed of EVIDENCE_SEEDS) {
      suites.push({ id: `healthy.${label}.${seed}`, kind: 'healthy', label, scenario: label, seed, n: 30, durationS: 4500 });
    }
  }
  for (const seed of EVIDENCE_SEEDS) {
    suites.push({ id: `maintenance.cellImbalance.${seed}`, kind: 'maintenance', label: 'cellImbalance', scenario: 'cellImbalance', seed, n: 30, durationS: 4500 });
  }
  for (const seed of EVIDENCE_SEEDS) {
    suites.push({ id: `overload.severeHeatLoad.${seed}`, kind: 'overload', label: 'severeHeatLoad', scenario: 'severeHeatLoad', seed, n: 30, durationS: 3000 });
  }
  for (const severity of SHORT_SEVERITIES) {
    for (const brand of ['A', 'B', 'C'] as const) {
      for (const seed of SHORT_SEEDS.slice(0, SHORT_SEED_COUNT[severity])) {
        // The short starts 20, 25 or 30 minutes in (after the engine has learned the pack).
        const atS = 1200 + 300 * (seed % 3);
        suites.push({
          id: `short.${severity}.${brand}.${seed}`,
          kind: 'short',
          label: 'internalShort',
          scenario: 'baseline',
          seed,
          n: 12,
          durationS: SHORT_DURATION_S[severity],
          short: { brand, atS, severity },
        });
      }
    }
  }
  return suites;
}

