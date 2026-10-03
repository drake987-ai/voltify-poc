// Runs one battery of a fleet through the real pipeline and records everything a
// screen needs to replay it: what the cloud received, what the AI concluded, the
// interventions it triggered, and (for validation overlays only) the simulator's
// ground truth. The same scenario and seed can be run in two worlds:
//   'bms'      the traditional BMS alone (no AI, no commands)
//   'voltify'  the AI watches and the intervention policy acts on its alerts
//   'observe'  the AI watches but nothing acts (the Digital Twin screen)
// Because the simulator draws a constant number of random numbers per tick, the
// worlds are bit-identical until the first command takes effect.
import { normalize, type Brand, type Telemetry } from '../adapters';
import { createEngine, ingest, type Assessment } from '../ai';
import {
  DEFAULT_POLICY,
  createCabinet,
  createIntervention,
  stepCabinet,
  stepIntervention,
  type CabinetEvent,
  type InterventionEventKind,
  type InterventionPolicy,
} from '../intervention';
import { RISK_RANK } from '../lib/riskLevels';
import {
  SIM,
  createFleet,
  injectFleetFault,
  stepFleet,
  truthOf,
  type BatteryControl,
  type City,
  type FaultSpec,
  type Mode,
  type ScenarioSelection,
} from '../sim';

/**
 * 'bms'      traditional BMS alone (no AI, no commands)
 * 'voltify'  AI watches and the vehicle intervention policy acts (power cut, swap)
 * 'observe'  AI watches, nothing acts
 * 'cabinet'  AI watches a pack on charge and cuts the cabinet's charging current when it is hot
 */
export type WorldMode = 'bms' | 'voltify' | 'observe' | 'cabinet';

export interface TimelineSpec {
  scenario: ScenarioSelection;
  seed: number;
  /** Fleet size; the monitored battery is the first one of `brand` (default 12). */
  n?: number;
  brand: Brand;
  /** Monitor this battery instead of the first one of `brand` (only it is simulated). */
  batteryId?: string;
  /** Per-battery scenarios, as in a live fleet. */
  overrides?: Readonly<Record<string, ScenarioSelection>>;
  city?: City | 'both';
  durationS: number;
  mode: WorldMode;
  policy?: InterventionPolicy;
  /** Inject an internal short into the monitored battery at runtime. */
  inject?: { atS: number; fault?: Partial<FaultSpec> };
}

/** Simulator ground truth at one frame. Only used for validation overlays, never fed to the AI. */
export interface TruthSample {
  coreTempC: number;
  qFaultW: number;
  soh: number;
  speedKmh: number;
  mode: Mode;
  bmsTripped: boolean;
  parked: boolean;
  derate: number;
  /** Multiplier applied to the charging current (1 = full). */
  chargeScale: number;
}

export interface TimelineFrame {
  /** Simulated seconds since the start of the run. */
  tS: number;
  telemetry: Telemetry;
  /** The AI's assessment of this frame (null in the 'bms' world, where no AI runs). */
  assessment: Assessment | null;
  truth: TruthSample;
}

export type TimelineEventKind = InterventionEventKind | 'bms_trip' | 'vehicle_stopped';

export interface TimelineEvent {
  kind: TimelineEventKind;
  tS: number;
  derate?: number;
  stationId?: string;
  distanceM?: number;
}

export interface TimelineSummary {
  /** First time the AI reached the alert level; null in the 'bms' world or if it never did. */
  alertS: number | null;
  /** First time the traditional BMS cut the pack off at 65 degC. */
  bmsTripS: number | null;
  derateS: number | null;
  swapS: number | null;
  /** The bike stopped on the road because the BMS cut off while it was being ridden. */
  vehicleStoppedS: number | null;
  peakTempC: number;
  peakAtS: number;
  finalTempC: number;
  /** Ground truth: the cell group with an internal short, if any (validation only). */
  faultCell: number | null;
}

export interface Timeline {
  spec: TimelineSpec;
  batteryId: string;
  brand: Brand;
  /** Where the monitored battery operates (for station look-ups and maps). */
  city: City;
  frames: TimelineFrame[];
  events: TimelineEvent[];
  /** Commands sent to the charging cabinet ('cabinet' mode only). */
  cabinetEvents: CabinetEvent[];
  summary: TimelineSummary;
}

export function runTimeline(spec: TimelineSpec): Timeline {
  const serial = spec.batteryId ? Number.parseInt(spec.batteryId.slice(2), 10) : 0;
  const fleet = createFleet({
    seed: spec.seed,
    n: Math.max(spec.n ?? 12, serial),
    scenario: spec.scenario,
    city: spec.city,
    overrides: spec.overrides,
    only: spec.batteryId ? [spec.batteryId] : undefined,
  });
  const battery = spec.batteryId
    ? fleet.batteries[0]
    : (fleet.batteries.find((b) => b.config.brand === spec.brand) ?? fleet.batteries[0]);
  if (!battery) throw new Error(`battery ${spec.batteryId ?? spec.brand} does not exist in this fleet`);
  const id = battery.config.id;
  const policy = spec.policy ?? DEFAULT_POLICY;
  const engine = spec.mode === 'bms' ? null : createEngine();
  const intervention = createIntervention();
  const cabinet = createCabinet();

  const frames: TimelineFrame[] = [];
  let control: BatteryControl | undefined;
  let injected = false;
  let alertS: number | null = null;
  const ticks = Math.round(spec.durationS / SIM.tickS);

  for (let k = 0; k < ticks; k++) {
    if (spec.inject && !injected && fleet.tS >= spec.inject.atS) {
      injectFleetFault(fleet, id, { onsetS: spec.inject.atS, ...spec.inject.fault });
      injected = true;
    }
    const step = stepFleet(fleet, control ? { [id]: control } : undefined);

    for (const frame of step.frames) {
      if (frame.batteryId !== id) continue;
      const parsed = normalize(frame.payload);
      if (!parsed.ok) continue;
      const telemetry = parsed.value;
      const tS = (telemetry.ts - SIM.epochMs) / 1000;
      const assessment = engine ? ingest(engine, telemetry) : null;

      if (assessment && spec.mode === 'voltify') {
        control = stepIntervention(
          intervention,
          { tS, level: assessment.risk.level, lat: telemetry.lat, lng: telemetry.lng, city: battery.config.city },
          policy,
        );
      } else if (assessment && spec.mode === 'cabinet') {
        control = stepCabinet(cabinet, assessment, tS);
      }
      if (assessment && alertS === null && RISK_RANK[assessment.risk.level] >= RISK_RANK[policy.alertLevel]) alertS = tS;

      const truth = truthOf(battery);
      frames.push({
        tS,
        telemetry,
        assessment,
        truth: {
          coreTempC: truth.coreTempC,
          qFaultW: truth.qFaultW,
          soh: truth.soh,
          speedKmh: battery.speedMs * 3.6,
          mode: truth.mode,
          bmsTripped: truth.bmsTripped,
          parked: control?.parked === true,
          derate: control?.derate ?? 0,
          chargeScale: control?.chargeCurrentScale ?? 1,
        },
      });
    }
  }

  const events: TimelineEvent[] = intervention.events.map((e) => ({ ...e }));
  const truthEnd = truthOf(battery);
  let vehicleStoppedS: number | null = null;
  if (truthEnd.bmsTrippedAtS !== null) {
    events.push({ kind: 'bms_trip', tS: truthEnd.bmsTrippedAtS });
    // The cut-off strands the shipper only if the pack was still on the bike (not yet swapped out).
    const swapped = intervention.swapAtS !== null && intervention.swapAtS <= truthEnd.bmsTrippedAtS;
    if (!swapped) {
      vehicleStoppedS = truthEnd.bmsTrippedAtS;
      events.push({ kind: 'vehicle_stopped', tS: truthEnd.bmsTrippedAtS });
    }
  }
  events.sort((a, b) => a.tS - b.tS);

  let peakTempC = -Infinity;
  let peakAtS = 0;
  for (const f of frames) {
    if (f.truth.coreTempC > peakTempC) {
      peakTempC = f.truth.coreTempC;
      peakAtS = f.tS;
    }
  }

  return {
    spec,
    batteryId: id,
    brand: battery.config.brand,
    city: battery.config.city,
    frames,
    events,
    cabinetEvents: cabinet.events,
    summary: {
      alertS,
      bmsTripS: truthEnd.bmsTrippedAtS,
      derateS: intervention.derateAtS,
      swapS: intervention.swapAtS,
      vehicleStoppedS,
      peakTempC,
      peakAtS,
      finalTempC: frames.length > 0 ? frames[frames.length - 1].truth.coreTempC : Number.NaN,
      faultCell: truthEnd.faultCell,
    },
  };
}

export interface ABResult {
  bms: Timeline;
  voltify: Timeline;
  /** Seconds between Voltify's alert and the BMS cut-off in the BMS world; null if either never happened. */
  leadTimeS: number | null;
}

/** The same scenario and seed, once with the traditional BMS only and once with Voltify. */
export function runAB(spec: Omit<TimelineSpec, 'mode'>): ABResult {
  const bms = runTimeline({ ...spec, mode: 'bms' });
  const voltify = runTimeline({ ...spec, mode: 'voltify' });
  const leadTimeS =
    voltify.summary.alertS !== null && bms.summary.bmsTripS !== null ? bms.summary.bmsTripS - voltify.summary.alertS : null;
  return { bms, voltify, leadTimeS };
}
