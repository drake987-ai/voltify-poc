// A fleet of batteries advanced in lock-step, 5 simulated seconds per tick.
import type { Brand, Telemetry } from '../adapters/schema';
import {
  createBattery,
  injectFault,
  NO_CONTROL,
  stepBattery,
  type BatteryControl,
  type BatteryState,
  type Environment,
  type FaultSpec,
} from './battery';
import { encodeTelemetry } from './brandFormats';
import { BRAND_SPECS, SIM, type City } from './params';
import { uniformFromKey } from './rng';
import { BASE_ENV, resolveScenario, type ScenarioSelection } from './scenarios';

export interface FleetOptions {
  seed: number;
  n: number;
  /** City of the routes; 'both' splits the fleet between TP.HCM and Ha Noi. */
  city?: City | 'both';
  /** Relative share of brands A, B, C. */
  brandMix?: readonly [number, number, number];
  /** Scenario applied to every battery (its weather part sets the fleet environment). */
  scenario?: ScenarioSelection;
  /** Per-battery scenarios by id (battery-level parts only; replace the fleet scenario for that battery). */
  overrides?: Readonly<Record<string, ScenarioSelection>>;
  /** Local clock hour at which the simulation starts (default 12). */
  startLocalHour?: number;
}

export interface FleetState {
  seed: number;
  options: FleetOptions;
  /** Completed ticks. */
  tick: number;
  /** Simulated seconds since SIM.epochMs. */
  tS: number;
  env: Environment;
  batteries: BatteryState[];
}

/** A vendor message as it travels over the wire, before any adapter touches it. */
export interface RawFrame {
  batteryId: string;
  brand: Brand;
  tsMs: number;
  payload: unknown;
}

export interface FleetStep {
  tick: number;
  tsMs: number;
  frames: RawFrame[];
}

function pickBrand(seed: number, index: number, mix: readonly [number, number, number]): Brand {
  const total = mix[0] + mix[1] + mix[2];
  const u = uniformFromKey(seed, `brand:${index}`) * total;
  return u < mix[0] ? 'A' : u < mix[0] + mix[1] ? 'B' : 'C';
}

export function createFleet(options: FleetOptions): FleetState {
  const { seed, n, city = 'hcmc', brandMix = [0.4, 0.35, 0.25], scenario = 'baseline', overrides = {} } = options;
  const base = resolveScenario(scenario);
  const env: Environment = { ...(base.env ?? BASE_ENV), offsetC: 0 };
  const startTS = ((options.startLocalHour ?? SIM.startLocalHour) - SIM.startLocalHour) * 3600;

  const batteries: BatteryState[] = [];
  for (let index = 0; index < n; index++) {
    // Brand and city come from keyed hashes, not a shared stream, so battery #k
    // is identical in a fleet of 50 and a fleet of 300.
    const brand = pickBrand(seed, index, brandMix);
    const batteryCity: City = city === 'both' ? (uniformFromKey(seed, `city:${index}`) < 0.5 ? 'hcmc' : 'hanoi') : city;
    const id = `${brand}-${String(index + 1).padStart(4, '0')}`;
    const override = overrides[id];
    const spec = override ? resolveScenario(override) : base;
    batteries.push(createBattery({ seed, index, brand, city: batteryCity, env, scenario: spec, startTS }));
  }
  return { seed, options, tick: 0, tS: startTS, env, batteries };
}

export function findBattery(fleet: FleetState, batteryId: string): BatteryState | undefined {
  // Ids are `${brand}-${index + 1}`, so the index is recoverable directly.
  const index = Number.parseInt(batteryId.slice(2), 10) - 1;
  const b = fleet.batteries[index];
  return b !== undefined && b.config.id === batteryId ? b : undefined;
}

/** Inject an internal short into one battery of a running fleet. Returns false if the id is unknown. */
export function injectFleetFault(fleet: FleetState, batteryId: string, spec: Partial<FaultSpec> = {}): boolean {
  const b = findBattery(fleet, batteryId);
  if (!b) return false;
  injectFault(b, spec);
  return true;
}

/**
 * Advance every battery by one tick and collect the vendor messages that are due
 * this tick (A every tick, B every 2nd, C every 3rd, each with its own phase).
 */
export function stepFleet(fleet: FleetState, controls?: Readonly<Record<string, BatteryControl>>): FleetStep {
  const frames: RawFrame[] = [];
  for (const b of fleet.batteries) {
    stepBattery(b, fleet.env, controls?.[b.config.id] ?? NO_CONTROL);
    const every = BRAND_SPECS[b.config.brand].emitEveryTicks;
    if ((fleet.tick + b.config.emitPhase) % every === 0) {
      const reading: Telemetry = b.reading;
      frames.push({ batteryId: b.config.id, brand: b.config.brand, tsMs: reading.ts, payload: encodeTelemetry(reading) });
    }
  }
  fleet.tick += 1;
  fleet.tS += SIM.tickS;
  return { tick: fleet.tick, tsMs: SIM.epochMs + fleet.tS * 1000, frames };
}
