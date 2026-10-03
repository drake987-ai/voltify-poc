// The messages the platform would send, shown as example payloads. They are illustrations
// of the kind of command and notification involved, NOT any vehicle maker's real protocol
// (each BMS and fleet API defines its own); the screen labels them as simulated.
import { explainAssessment } from '../../ai';
import type { Timeline, TimelineEvent } from '../../eval/timeline';
import type { CabinetEvent } from '../../intervention';
import { frameAt } from '../../lib/timelineSeries';
import { SIM } from '../../sim';

export type CommandChannel = 'platform' | 'vehicle' | 'app' | 'station' | 'cabinet';

/** Also the suffix of the `intervention.log.kinds.*` locale key. */
export type CommandKind =
  | TimelineEvent['kind']
  | 'shipper_notified_nostation'
  | CabinetEvent['kind'];

export interface CommandEntry {
  tS: number;
  channel: CommandChannel;
  kind: CommandKind;
  payload: Record<string, unknown>;
}

const isoAt = (tS: number) => new Date(SIM.epochMs + tS * 1000).toISOString();
const round = (x: number, dp = 0) => Math.round(x * 10 ** dp) / 10 ** dp;

function vehicleEntry(timeline: Timeline, e: TimelineEvent): CommandEntry {
  const id = timeline.batteryId;
  const ts = isoAt(e.tS);
  switch (e.kind) {
    case 'ai_alert': {
      const a = frameAt(timeline.frames, e.tS)?.assessment ?? null;
      return {
        tS: e.tS,
        channel: 'platform',
        kind: e.kind,
        payload: {
          event: 'RISK_ALERT',
          ts,
          battery_id: id,
          risk_score: a ? round(a.risk.score) : null,
          level: a ? a.risk.level : null,
          top_signal: a ? (explainAssessment(a)[0]?.signal ?? null) : null,
          eta_to_65c_min: a && a.thermal.etaToLimitS !== null ? round(a.thermal.etaToLimitS / 60) : null,
        },
      };
    }
    case 'derate_sent':
      return {
        tS: e.tS,
        channel: 'vehicle',
        kind: e.kind,
        payload: {
          cmd: 'SET_DISCHARGE_LIMIT',
          ts,
          battery_id: id,
          limit_pct: round((1 - (e.derate ?? 0)) * 100),
          reason: 'RISK_ALERT',
        },
      };
    case 'shipper_notified':
      return {
        tS: e.tS,
        channel: 'app',
        kind: e.stationId !== undefined ? 'shipper_notified' : 'shipper_notified_nostation',
        payload: {
          push: e.stationId !== undefined ? 'SWAP_NOW' : 'SWAP_NEAREST',
          ts,
          battery_id: id,
          ...(e.stationId !== undefined
            ? { station_id: e.stationId, distance_m: round(e.distanceM ?? 0), cool_pack_reserved: true }
            : {}),
        },
      };
    case 'swap_done':
      return {
        tS: e.tS,
        channel: 'station',
        kind: e.kind,
        payload: { event: 'SWAP_COMPLETED', ts, returned_pack: id, returned_pack_state: 'HOLD_FOR_COOLING' },
      };
    case 'bms_trip':
      return { tS: e.tS, channel: 'vehicle', kind: e.kind, payload: { event: 'BMS_CUTOFF', ts, battery_id: id, core_temp_c: 65 } };
    case 'vehicle_stopped':
      return { tS: e.tS, channel: 'vehicle', kind: e.kind, payload: { event: 'VEHICLE_STOPPED', ts, battery_id: id } };
  }
}

/** Everything sent for one vehicle, in time order. */
export function vehicleCommandLog(timeline: Timeline): CommandEntry[] {
  return timeline.events.map((e) => vehicleEntry(timeline, e)).sort((a, b) => a.tS - b.tS);
}

const cabinetEntry = (timeline: Timeline, e: CabinetEvent): CommandEntry => ({
  tS: e.tS,
  channel: 'cabinet',
  kind: e.kind,
  payload: {
    cmd: 'SET_CHARGE_CURRENT_SCALE',
    ts: isoAt(e.tS),
    battery_id: timeline.batteryId,
    scale: round(e.scale, 2),
    core_temp_c: round(e.tempC, 1),
    reason: e.kind === 'charge_restored' ? 'PACK_COOL_OR_DONE' : 'DERATING_CURVE',
  },
});

/** The commands sent to the charging cabinet, up to `untilS` (the end of the charge shown on screen). */
export function cabinetCommandLog(timeline: Timeline, untilS = Infinity): CommandEntry[] {
  return timeline.cabinetEvents.filter((e) => e.tS <= untilS).map((e) => cabinetEntry(timeline, e));
}

export const formatPayload = (p: Record<string, unknown>): string => JSON.stringify(p, null, 2);
