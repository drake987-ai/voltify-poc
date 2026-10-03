// What happens in the demo fleet: a hot afternoon in which most packs behave normally and a
// known share are in trouble in different ways, assigned deterministically from the seed
// so every run of the same seed tells the same story.
import { DEFAULT_POLICY, type InterventionPolicy } from '../intervention';
import {
  batteryIdAt,
  uniformFromKey,
  type City,
  type FaultSpec,
  type FleetOptions,
  type ScenarioSelection,
} from '../sim';

export type FleetRole = 'normal' | 'severe' | 'short' | 'heavy' | 'aged' | 'weakCell';

export interface FleetConfig {
  seed: number;
  n: number;
  city: City | 'both';
  policy: InterventionPolicy;
}

export const DEFAULT_FLEET_CONFIG: FleetConfig = { seed: 2026, n: 300, city: 'both', policy: DEFAULT_POLICY };

export interface PlannedFault {
  id: string;
  /** Simulated seconds from the start when the short begins. */
  atS: number;
  fault: Partial<FaultSpec>;
}

export interface FleetPlan {
  config: FleetConfig;
  options: FleetOptions;
  roles: Record<string, FleetRole>;
  /** Sorted by time. */
  faults: PlannedFault[];
}

/** Share of the fleet in each trouble role; the rest is normal. */
export const ROLE_SHARES: Record<Exclude<FleetRole, 'normal'>, number> = {
  severe: 0.04,
  short: 0.035,
  heavy: 0.04,
  aged: 0.035,
  weakCell: 0.03,
};

const ROLE_ORDER = Object.keys(ROLE_SHARES) as Exclude<FleetRole, 'normal'>[];

const ROLE_SCENARIO: Partial<Record<FleetRole, ScenarioSelection>> = {
  severe: ['severeHeatLoad'],
  heavy: ['heavyClimb'],
  aged: ['agedHigh'],
  weakCell: ['cellImbalance'],
};

/** The injected short: a soft short that tightens within minutes (same shape as the `escalatingShort` scenario). */
const SHORT_FAULT: Partial<FaultSpec> = { rShortOhm0: 20, rShortMinOhm: 0.08, tauS: 300 };

export function buildFleetPlan(config: FleetConfig): FleetPlan {
  const roles: Record<string, FleetRole> = {};
  const overrides: Record<string, ScenarioSelection> = {};
  const faults: PlannedFault[] = [];

  for (let index = 0; index < config.n; index++) {
    const id = batteryIdAt(config.seed, index);
    const u = uniformFromKey(config.seed, `role:${id}`);
    let role: FleetRole = 'normal';
    let edge = 0;
    for (const r of ROLE_ORDER) {
      edge += ROLE_SHARES[r];
      if (u < edge) {
        role = r;
        break;
      }
    }
    roles[id] = role;
    const scenario = ROLE_SCENARIO[role];
    if (scenario) overrides[id] = scenario;
    if (role === 'short') {
      // Between 10 and 90 minutes in, so incidents keep arriving while the demo runs.
      const atS = Math.round((600 + uniformFromKey(config.seed, `short-at:${id}`) * 4800) / 5) * 5;
      faults.push({ id, atS, fault: SHORT_FAULT });
    }
  }
  faults.sort((a, b) => a.atS - b.atS);

  return {
    config,
    options: { seed: config.seed, n: config.n, city: config.city, scenario: 'heatwave43', overrides },
    roles,
    faults,
  };
}
