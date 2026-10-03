// The decision layer between the AI and the vehicle (CLAUDE.md section 4):
//   AI alert -> power cut sent to the vehicle -> shipper told to swap at the nearest
//   station that has a cool pack -> pack swapped out (it then sits with no load).
// It consumes only what the platform knows (the AI's risk level, the vehicle's
// position and the clock) and produces the control the simulator applies, plus a
// log of events that the Intervention screen shows.
import { RISK_RANK, type RiskLevel } from '../lib/riskLevels';
import type { BatteryControl } from '../sim/battery';
import type { City } from '../sim/params';
import { nearestStation } from './stations';

export interface InterventionPolicy {
  /** Lowest risk level that triggers the intervention. */
  alertLevel: RiskLevel;
  /** Discharge power cut sent to the vehicle (0.15 = "hạ công suất xả 15%"). */
  derate: number;
  /** Seconds for the command to reach the vehicle (cloud -> vehicle server -> BMS). */
  commandLatencyS: number;
  /** Seconds for the shipper to see the notification and turn toward the station. */
  shipperReactionS: number;
  /** Riding speed to the station on a derated pack, m/s. */
  rideSpeedMs: number;
  /** Seconds to hand the old pack over and take a cool one. */
  swapHandlingS: number;
  /** Used if no station has a cool pack: assume this long to reach a swap, s. */
  fallbackSwapDelayS: number;
}

export const DEFAULT_POLICY: InterventionPolicy = {
  alertLevel: 'warning',
  derate: 0.15,
  commandLatencyS: 10,
  shipperReactionS: 30,
  rideSpeedMs: 6,
  swapHandlingS: 90,
  fallbackSwapDelayS: 600,
};

export type InterventionEventKind = 'ai_alert' | 'derate_sent' | 'shipper_notified' | 'swap_done';

export interface InterventionEvent {
  kind: InterventionEventKind;
  /** Simulated seconds. */
  tS: number;
  derate?: number;
  stationId?: string;
  distanceM?: number;
}

export interface InterventionState {
  alertAtS: number | null;
  derateAtS: number | null;
  swapAtS: number | null;
  stationId: string | null;
  stationDistanceM: number | null;
  events: InterventionEvent[];
}

export const createIntervention = (): InterventionState => ({
  alertAtS: null,
  derateAtS: null,
  swapAtS: null,
  stationId: null,
  stationDistanceM: null,
  events: [],
});

export interface InterventionInput {
  tS: number;
  level: RiskLevel;
  lat: number;
  lng: number;
  city: City;
}

/**
 * Advance the intervention by one tick and return the control to apply from now on.
 * The first time the level reaches the alert level the whole plan is scheduled:
 * the power cut after the command latency, then the swap after the shipper has
 * reacted, ridden to the nearest station with a cool pack, and handed the packs over.
 */
export function stepIntervention(
  state: InterventionState,
  input: InterventionInput,
  policy: InterventionPolicy = DEFAULT_POLICY,
): BatteryControl {
  const { tS } = input;

  if (state.alertAtS === null && RISK_RANK[input.level] >= RISK_RANK[policy.alertLevel]) {
    state.alertAtS = tS;
    state.events.push({ kind: 'ai_alert', tS });
    state.derateAtS = tS + policy.commandLatencyS;
    const nearest = nearestStation(input.city, input.lat, input.lng);
    state.stationId = nearest?.station.id ?? null;
    state.stationDistanceM = nearest?.distanceM ?? null;
    state.swapAtS =
      state.derateAtS +
      (nearest
        ? policy.shipperReactionS + nearest.distanceM / policy.rideSpeedMs + policy.swapHandlingS
        : policy.fallbackSwapDelayS);
  }

  let derating = false;
  let parked = false;
  if (state.derateAtS !== null && tS >= state.derateAtS) {
    derating = true;
    if (!state.events.some((e) => e.kind === 'derate_sent')) {
      state.events.push({ kind: 'derate_sent', tS: state.derateAtS, derate: policy.derate });
      state.events.push({
        kind: 'shipper_notified',
        tS: state.derateAtS,
        ...(state.stationId !== null && state.stationDistanceM !== null
          ? { stationId: state.stationId, distanceM: state.stationDistanceM }
          : {}),
      });
    }
  }
  if (state.swapAtS !== null && tS >= state.swapAtS) {
    parked = true;
    if (!state.events.some((e) => e.kind === 'swap_done')) state.events.push({ kind: 'swap_done', tS: state.swapAtS });
  }

  return { derate: derating ? policy.derate : 0, chargeCurrentScale: 1, parked };
}
