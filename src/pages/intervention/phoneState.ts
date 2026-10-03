// What the shipper's phone shows at a given moment of the replay, derived from the
// intervention events and the intervention policy (the same numbers the simulator used).
import type { Timeline } from '../../eval/timeline';
import { DEFAULT_POLICY, stationsFor, type InterventionPolicy, type Station } from '../../intervention';
import { frameAt } from '../../lib/timelineSeries';

export type PhoneStage =
  /** Nothing to do: the app just shows the pack. */
  | 'watching'
  /** The notification has arrived; the shipper has not yet set off. */
  | 'notified'
  /** Riding to the swap station. */
  | 'riding'
  /** At the station, packs being swapped. */
  | 'swapping'
  | 'done';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface PhoneState {
  stage: PhoneStage;
  /** Power cut in force on the vehicle (0 or the policy's derate). */
  derate: number;
  /** The station the shipper was sent to, if any station had a cool pack. */
  station: Station | null;
  /** Straight-line distance to that station when the shipper was told, metres. */
  distanceM: number | null;
  /** Metres still to ride (equals distanceM until the shipper sets off). */
  remainingM: number | null;
  /** Where the shipper was when told. */
  start: LatLng | null;
  /** Where the shipper is now: on the straight line to the station once riding. */
  position: LatLng | null;
  /** 0 to 1 along the way to the station. */
  progress: number;
  /** Seconds at which each step happens, for the step list. */
  times: { notifiedS: number | null; departS: number | null; arriveS: number | null; swapS: number | null };
}

const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

export function phoneStateAt(timeline: Timeline, tS: number, policy: InterventionPolicy = DEFAULT_POLICY): PhoneState {
  const notified = timeline.events.find((e) => e.kind === 'shipper_notified');
  const swap = timeline.events.find((e) => e.kind === 'swap_done');
  const here = frameAt(timeline.frames, tS);
  const nowPos: LatLng | null = here ? { lat: here.telemetry.lat, lng: here.telemetry.lng } : null;

  const idle: PhoneState = {
    stage: 'watching',
    derate: 0,
    station: null,
    distanceM: null,
    remainingM: null,
    start: null,
    position: nowPos,
    progress: 0,
    times: { notifiedS: notified?.tS ?? null, departS: null, arriveS: null, swapS: swap?.tS ?? null },
  };
  if (!notified || tS < notified.tS) return idle;

  const startFrame = frameAt(timeline.frames, notified.tS);
  const start: LatLng | null = startFrame ? { lat: startFrame.telemetry.lat, lng: startFrame.telemetry.lng } : null;
  const station =
    notified.stationId !== undefined ? (stationsFor(timeline.city).find((s) => s.id === notified.stationId) ?? null) : null;
  const distanceM = notified.stationId !== undefined ? (notified.distanceM ?? null) : null;

  const departS = notified.tS + policy.shipperReactionS;
  const travelS = distanceM !== null ? distanceM / policy.rideSpeedMs : null;
  const arriveS = travelS !== null ? departS + travelS : null;
  const swapS = swap?.tS ?? null;

  let stage: PhoneStage;
  if (swapS !== null && tS >= swapS) stage = 'done';
  else if (arriveS !== null && tS >= arriveS) stage = 'swapping';
  else if (tS >= departS && arriveS !== null) stage = 'riding';
  else stage = 'notified';

  const progress =
    travelS === null || travelS <= 0 ? 0 : Math.min(1, Math.max(0, (tS - departS) / travelS));
  const position =
    start && station && stage !== 'notified'
      ? { lat: lerp(start.lat, station.lat, progress), lng: lerp(start.lng, station.lng, progress) }
      : (start ?? nowPos);

  return {
    stage,
    derate: policy.derate,
    station,
    distanceM,
    remainingM: distanceM === null ? null : distanceM * (1 - progress),
    start,
    position,
    progress,
    times: { notifiedS: notified.tS, departS: station ? departS : null, arriveS, swapS },
  };
}
