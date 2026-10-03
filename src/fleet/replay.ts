// Rebuild the history of one pack of the live fleet. Every battery evolves from its own
// seed (the simulator draws the same random numbers whatever else is in the fleet), and the
// AI and the intervention policy are the same code, so replaying that one pack on its own
// reproduces exactly what the fleet showed, which is what lets the Digital Twin screen open
// the pack picked on the map.
import type { Brand } from '../adapters';
import type { TimelineSpec } from '../eval/timeline';
import { buildFleetPlan, type FleetConfig, type FleetRole } from './plan';

/** Long enough to cover the latest start of an injected short (90 min) plus its aftermath. */
export const TWIN_REPLAY_DURATION_S = 7200;

const BRAND_OF_PREFIX: Record<string, Brand> = { A: 'A', B: 'B', C: 'C' };

export interface LiveTwin {
  spec: TimelineSpec;
  role: FleetRole;
}

/** The timeline spec that replays pack `id` of the fleet described by `config`, or null if the fleet has no such pack. */
export function liveTwinSpec(config: FleetConfig, id: string, durationS = TWIN_REPLAY_DURATION_S): LiveTwin | null {
  const brand = BRAND_OF_PREFIX[id.charAt(0)];
  if (!brand) return null;
  const plan = buildFleetPlan(config);
  const role = plan.roles[id];
  if (role === undefined) return null;
  const override = plan.options.overrides?.[id];
  const fault = plan.faults.find((f) => f.id === id);
  return {
    role,
    spec: {
      scenario: 'heatwave43',
      seed: config.seed,
      brand,
      batteryId: id,
      n: config.n,
      city: config.city,
      ...(override ? { overrides: { [id]: override } } : {}),
      durationS,
      mode: 'voltify',
      policy: config.policy,
      ...(fault ? { inject: { atS: fault.atS, fault: fault.fault } } : {}),
    },
  };
}
