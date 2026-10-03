// How many of the incidents a traditional BMS could not avoid did Voltify prevent, measured by
// running the demo fleet and its no-intervention twin side by side (see liveFleet.ts). The fleet
// is built with troubled packs on purpose, so this is a measurement on the simulation, not a rate
// to expect in the field; the ROI screen says so next to the figure and lets the user override it.
import { advanceLive, createLiveFleet, snapshotOf } from './liveFleet';
import { DEFAULT_FLEET_CONFIG, type FleetConfig } from './plan';

/** Long enough for the slowest-developing incidents of the demo fleet (injected shorts start up to 90 min in). */
export const PREVENTION_MINUTES = 120;

export interface PreventionMeasure {
  seed: number;
  packs: number;
  minutes: number;
  /** Packs a traditional BMS cut off (the control fleet, nobody acting). */
  baselineTrips: number;
  /** Packs the BMS still cut off in the Voltify fleet. */
  voltifyTrips: number;
  /** Cut-offs of the control fleet that did not happen in the Voltify fleet. */
  prevented: number;
  /** prevented / baselineTrips, or null if the control fleet had no cut-off at all. */
  rate: number | null;
}

export function measurePrevention(config: FleetConfig = DEFAULT_FLEET_CONFIG, minutes = PREVENTION_MINUTES): PreventionMeasure {
  const live = createLiveFleet(config);
  advanceLive(live, Math.round((minutes * 60) / 5));
  const k = snapshotOf(live).kpis;
  return {
    seed: config.seed,
    packs: config.n,
    minutes,
    baselineTrips: k.bmsTripsBaseline,
    voltifyTrips: k.bmsTripsVoltify,
    prevented: k.prevented,
    rate: k.bmsTripsBaseline > 0 ? k.prevented / k.bmsTripsBaseline : null,
  };
}
