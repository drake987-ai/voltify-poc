// Charging-cabinet side of the intervention (CLAUDE.md section 5): when a pack that
// is being charged is hot, or is being charged faster than its derating curve allows
// at that temperature, the platform cuts the charging current the cabinet delivers.
// It reads only the AI's assessment and returns the control the simulator applies.
import { AI_CONFIG, clamp, type Assessment } from '../ai';
import type { BatteryControl } from '../sim/battery';

export type CabinetEventKind = 'charge_reduced' | 'charge_adjusted' | 'charge_restored';

export interface CabinetEvent {
  kind: CabinetEventKind;
  tS: number;
  /** Charging-current multiplier sent to the cabinet (0..1). */
  scale: number;
  /** Core temperature at that moment, degC. */
  tempC: number;
}

export interface CabinetState {
  active: boolean;
  /** Charging-current multiplier currently in force at the cabinet. */
  lastScale: number;
  /** When the last command was sent; adjustments are rate-limited from it. */
  lastEventS: number;
  events: CabinetEvent[];
}

export const createCabinet = (): CabinetState => ({ active: false, lastScale: 1, lastEventS: -Infinity, events: [] });

/** A change smaller than this is not worth a new command to the cabinet. */
const MIN_SCALE_STEP = 0.1;
/** The cabinet is not told to change its current more often than this (the pack's temperature moves over minutes). */
const MIN_ADJUST_INTERVAL_S = 60;
/** Never cut the charge below this share of the requested current: the pack still has to be filled. */
const MIN_SCALE = 0.2;
/** A hot pack is never charged at more than this share of the request, even when it is inside the curve. */
const HOT_MAX_SCALE = 0.8;
/** Commands are quantised to this step so the cabinet is not sent noise. */
const SCALE_QUANTUM = 0.05;

/** Below this smoothed C-rate the trickle at the end of a charge no longer counts as charging for the cabinet. */
const MIN_CHARGE_C = 0.05;

const quantise = (x: number) => Math.round(x / SCALE_QUANTUM) * SCALE_QUANTUM;

/**
 * Keep the charging current inside the temperature derating curve.
 *
 * The AI sees the current the pack actually receives, which is the cabinet's request times
 * the scale already in force. So the request is recovered as `present current / scale in
 * force`, and the new scale is the curve's allowance (with its safety margin) over that
 * request. Computing it from the already reduced current would feed the cut back into itself.
 */
export function stepCabinet(state: CabinetState, a: Assessment, tS: number): BatteryControl {
  const o = a.overload;
  const charging = o.charging && o.cRateRms >= MIN_CHARGE_C;
  const wants = charging && (o.hotCharge || o.ratio > 1);

  // Near the end of a charge the current hovers around the "is charging" threshold; a change of state
  // within one interval of the last command is ignored so the cabinet is not toggled back and forth.
  const settled = tS - state.lastEventS >= MIN_ADJUST_INTERVAL_S;

  if (!charging) {
    if (state.active && settled) {
      state.active = false;
      state.lastScale = 1;
      state.lastEventS = tS;
      state.events.push({ kind: 'charge_restored', tS, scale: 1, tempC: o.tempC });
    }
    return { derate: 0, chargeCurrentScale: state.active ? state.lastScale : 1 };
  }

  if (wants || state.active) {
    const requestedC = o.cRate / Math.max(state.lastScale, 1e-3);
    const allowance = requestedC > 1e-6 ? (AI_CONFIG.overload.targetRatio * o.limitC) / requestedC : 1;
    const target = quantise(clamp(allowance, MIN_SCALE, o.hotCharge ? HOT_MAX_SCALE : 1));

    if (!state.active) {
      if (wants && settled) {
        state.active = true;
        state.lastScale = target;
        state.lastEventS = tS;
        state.events.push({ kind: 'charge_reduced', tS, scale: target, tempC: o.tempC });
      }
    } else if (Math.abs(target - state.lastScale) >= MIN_SCALE_STEP && settled) {
      state.lastEventS = tS;
      if (target >= 1) {
        // The pack has cooled enough for the full request.
        state.active = false;
        state.lastScale = 1;
        state.events.push({ kind: 'charge_restored', tS, scale: 1, tempC: o.tempC });
      } else {
        state.lastScale = target;
        state.events.push({ kind: 'charge_adjusted', tS, scale: target, tempC: o.tempC });
      }
    }
  }

  return { derate: 0, chargeCurrentScale: state.active ? state.lastScale : 1 };
}
