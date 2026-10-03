// One battery: equivalent-circuit cells + lumped thermal + aging + vehicle load +
// traditional BMS cut-off. State is plain data (structured-clone friendly) and
// `stepBattery` advances it in place by one 5 s physics tick.
import { formatBatteryId, type Brand, type Telemetry } from '../adapters/schema';
import { fadePerEfc } from './aging';
import { r0Factor, stepRc, terminalVoltage } from './ecm';
import { ocv } from './ocv';
import {
  AGING,
  BMS,
  BRAND_SPECS,
  CELL,
  CHARGING,
  FAULT,
  FLEET_SOH,
  SENSOR,
  SIM,
  THERMAL,
  VEHICLE,
  type City,
} from './params';
import { generateRoute, gradeAt, positionAt, type Route } from './route';
import { clamp, createRng, hashString, mixSeed, nextNormal, nextU, uniform, type Rng } from './rng';
import type { ScenarioSpec } from './scenarios';
import { thermalStep } from './thermal';
import { batteryPowerW, wheelPowerW } from './vehicle';

export type Mode = 'riding' | 'idle' | 'charging';

/** Internal soft short in one cell group (the "Q_fault" source of CLAUDE.md section 5). */
export interface FaultSpec {
  cell: number;
  /** Simulated seconds (same clock as `tS`) when the short starts. */
  onsetS: number;
  rShortOhm0: number;
  rShortMinOhm: number;
  tauS: number;
}

/** Commands the platform can send down to a battery (Intervention, CLAUDE.md section 5). */
export interface BatteryControl {
  /** Discharge power reduction, 0..0.5 (0.15 = "hạ công suất xả 15%"). */
  derate: number;
  /** Multiplier on the charging current, 0..1 (cabinet current reduction). */
  chargeCurrentScale: number;
  /**
   * The pack has been taken off the vehicle at a swap station and sits with no load
   * (only the BMS and GPS/4G standby draw). Heat already stored and any internal fault
   * heat remain, so this stops load-driven heating but cannot stop a short.
   */
  parked?: boolean;
}
export const NO_CONTROL: BatteryControl = { derate: 0, chargeCurrentScale: 1 };

export interface Environment {
  /** Air temperature profile: minimum at 03:00 local, maximum at 15:00 local. */
  ambientMinC: number;
  ambientMaxC: number;
  /** Extra offset the Sandbox can dial in. */
  offsetC: number;
}

export interface LoadProfile {
  payloadKg: number;
  /** Extra sustained grade (rise/run) during a climb and the fraction of each 3 km it covers. */
  climbGrade: number;
  climbDuty: number;
  /** Multiplier on the driver's cruising speed. */
  speedScale: number;
  /** If false the pack is parked at low SOC instead of going to charge (used by test scenarios). */
  autoCharge: boolean;
  /** Charging rate in C of the pack's capacity (a fast-charge cabinet uses about 1 C). */
  chargeCRate: number;
}

/** Fixed properties of one battery (unit-to-unit variation, route, driver). */
export interface BatteryConfig {
  id: string;
  brand: Brand;
  city: City;
  seriesCells: number;
  parallelCells: number;
  /** Ah of one series group when new. */
  groupCapacityAh: number;
  /** ohm, R0 of one series group at 25 degC when new. */
  r0GroupOhm: number;
  thermalCapacityJPerK: number;
  thermalConductanceWPerK: number;
  capVar: number[];
  r0Var: number[];
  /** degC offset of this battery's surroundings from the city air temperature. */
  microclimateC: number;
  route: Route;
  gradePhases: [number, number];
  speedPhase: number;
  /** m/s, this driver's cruising speed. */
  cruiseMs: number;
  /** Cell an injected fault would hit by default. */
  faultCell: number;
  /** Phase offset (in ticks) of this battery's telemetry cadence. */
  emitPhase: number;
}

export interface BatteryState {
  config: BatteryConfig;
  rng: Rng;
  /** Simulated seconds since SIM.epochMs. */
  tS: number;
  coreTempC: number;
  soh: number;
  /** Equivalent full cycles accumulated (also reported as cycleCount). */
  efc: number;
  cellSoc: number[];
  cellVrc: number[];
  mode: Mode;
  idleLeftS: number;
  stopLeftS: number;
  speedMs: number;
  distanceM: number;
  load: LoadProfile;
  fault: FaultSpec | null;
  bmsTripped: boolean;
  bmsTrippedAtS: number | null;
  // Latest true (noise-free) values of the last step.
  currentA: number;
  packVoltageV: number;
  cellVoltagesV: number[];
  ambientC: number;
  r0PackOhm: number;
  qFaultW: number;
  shortCurrentA: number;
  /** What the pack's sensors reported for the last step (noise included, before vendor quantisation). */
  reading: Telemetry;
}

/**
 * Ground truth that exists only inside the simulator. It is NEVER sent through an
 * adapter: the AI sees only Telemetry. Validation (Evidence screen) uses it for labels.
 */
export interface BatteryTruth {
  batteryId: string;
  tS: number;
  mode: Mode;
  soh: number;
  efc: number;
  r0PackOhm: number;
  coreTempC: number;
  qFaultW: number;
  shortCurrentA: number;
  faultActive: boolean;
  faultCell: number | null;
  faultOnsetS: number | null;
  bmsTripped: boolean;
  bmsTrippedAtS: number | null;
}

// Scratch buffers (single-threaded; each Worker has its own module instance).
const Z_COUNT = 24;
const Z = new Float64Array(Z_COUNT);
const ZERO = new Float64Array(Z_COUNT);
const R0 = new Float64Array(CELL.seriesCells);

/** Air temperature around the pack at simulated second `tS`. */
export function ambientAt(env: Environment, tS: number, microclimateC = 0): number {
  const hour = SIM.startLocalHour + tS / 3600;
  const mean = 0.5 * (env.ambientMinC + env.ambientMaxC);
  const amp = 0.5 * (env.ambientMaxC - env.ambientMinC);
  return mean + amp * Math.sin((2 * Math.PI * (hour - 9)) / 24) + env.offsetC + microclimateC;
}

export interface CreateBatteryArgs {
  seed: number;
  /** Zero-based index in the fleet; the id is `${brand}-${index + 1}`. */
  index: number;
  brand: Brand;
  city: City;
  env: Environment;
  scenario: ScenarioSpec;
  /** Simulated second at which the battery starts. */
  startTS: number;
}

export function createBattery(a: CreateBatteryArgs): BatteryState {
  const id = formatBatteryId(a.brand, a.index + 1);
  const rng = createRng(mixSeed(a.seed, id));
  const spec = BRAND_SPECS[a.brand];
  const n = CELL.seriesCells;

  // Every random draw below happens in a fixed order whatever the scenario, and the
  // scenario then overrides values deterministically. So a battery's random
  // properties never depend on which scenario it was given.
  const capVar = Array.from({ length: n }, () => clamp(1 + CELL.capVarSigma * nextNormal(rng), 0.96, 1.04));
  const r0Var = Array.from({ length: n }, () => clamp(1 + CELL.r0VarSigma * nextNormal(rng), 0.9, 1.1));
  const hAMult = uniform(rng, 1 - THERMAL.conductanceSpread, 1 + THERMAL.conductanceSpread);
  const cMult = uniform(rng, 1 - THERMAL.capacitySpread, 1 + THERMAL.capacitySpread);
  const microDrawn = uniform(rng, -0.8, 0.8);
  const route = generateRoute(rng, a.city);
  const gradePhases: [number, number] = [uniform(rng, 0, 2 * Math.PI), uniform(rng, 0, 2 * Math.PI)];
  const speedPhase = uniform(rng, 0, 2 * Math.PI);
  const cruiseKmh = clamp(
    VEHICLE.cruiseKmh.mean + VEHICLE.cruiseKmh.sigma * nextNormal(rng),
    VEHICLE.cruiseKmh.min,
    VEHICLE.cruiseKmh.max,
  );
  const payloadDrawn = uniform(rng, VEHICLE.payloadKg.min, VEHICLE.payloadKg.max);
  const sohDrawn = clamp(FLEET_SOH.mean + FLEET_SOH.sigma * nextNormal(rng), FLEET_SOH.min, FLEET_SOH.max);
  const socU = nextU(rng);
  const tempAboveDrawn = uniform(rng, 0, 3);
  const faultCell = Math.floor(nextU(rng) * n);
  const efcJitter = clamp(1 + 0.15 * nextNormal(rng), 0.6, 1.4);
  const socSpread = Array.from({ length: n }, () => CELL.socSpreadSigma * nextNormal(rng));
  const distance0 = uniform(rng, 0, 2 * route.totalM);

  const sc = a.scenario;
  const soh = sc.soh ?? sohDrawn;
  const [socLo, socHi] = sc.socRange ?? [0.35, 0.95];
  const socStart = socLo + (socHi - socLo) * socU;

  if (sc.weakCell) {
    const w = sc.weakCell.cell ?? faultCell;
    capVar[w] *= sc.weakCell.capScale;
    r0Var[w] *= sc.weakCell.r0Scale;
  }

  const load: LoadProfile = {
    payloadKg: sc.load?.payloadKg ?? payloadDrawn,
    climbGrade: sc.load?.climbGrade ?? 0,
    climbDuty: sc.load?.climbDuty ?? 0,
    speedScale: sc.load?.speedScale ?? 1,
    autoCharge: sc.load?.autoCharge ?? true,
    chargeCRate: sc.load?.chargeCRate ?? CHARGING.cRate,
  };

  const config: BatteryConfig = {
    id,
    brand: a.brand,
    city: a.city,
    seriesCells: n,
    parallelCells: spec.parallelCells,
    groupCapacityAh: spec.parallelCells * CELL.cellCapacityAh,
    r0GroupOhm: CELL.r0CellOhm / spec.parallelCells,
    thermalCapacityJPerK: THERMAL.capacityJPerK * spec.thermalCScale * cMult,
    thermalConductanceWPerK: THERMAL.conductanceWPerK * spec.thermalHAScale * hAMult * (sc.coolingScale ?? 1),
    capVar,
    r0Var,
    microclimateC: microDrawn + (a.city === 'hanoi' ? -1 : 0),
    route,
    gradePhases,
    speedPhase,
    cruiseMs: cruiseKmh / 3.6,
    faultCell,
    emitPhase: hashString(id) % spec.emitEveryTicks,
  };

  const cellSoc = socSpread.map((d) => clamp(socStart + d, 0, 1));
  const cellVoltagesV = cellSoc.map((s) => ocv(s));
  const ambientC = ambientAt(a.env, a.startTS, config.microclimateC);
  const tempAbove = sc.coreTempAboveAmbientC ?? tempAboveDrawn;

  const state: BatteryState = {
    config,
    rng,
    tS: a.startTS,
    coreTempC: ambientC + tempAbove,
    soh,
    efc: ((1 - soh) / fadePerEfc(AGING.refTempC)) * efcJitter,
    cellSoc,
    cellVrc: new Array<number>(n).fill(0),
    mode: sc.startMode ?? 'riding',
    idleLeftS: 0,
    stopLeftS: 0,
    speedMs: 0.8 * config.cruiseMs * load.speedScale,
    distanceM: distance0,
    load,
    fault: sc.fault
      ? {
          cell: sc.fault.cell ?? faultCell,
          onsetS: a.startTS + sc.fault.onsetS,
          rShortOhm0: sc.fault.rShortOhm0,
          rShortMinOhm: sc.fault.rShortMinOhm,
          tauS: sc.fault.tauS,
        }
      : null,
    bmsTripped: false,
    bmsTrippedAtS: null,
    currentA: 0,
    packVoltageV: cellVoltagesV.reduce((s, v) => s + v, 0),
    cellVoltagesV,
    ambientC,
    r0PackOhm: 0,
    qFaultW: 0,
    shortCurrentA: 0,
    reading: undefined as unknown as Telemetry,
  };
  sense(state, ZERO);
  return state;
}

/** Build the sensor reading of the current state (noise array indices: 0..15 cells, 16 I, 17 T, 18 Tamb, 19 SOC). */
function sense(b: BatteryState, noise: Float64Array): void {
  const cfg = b.config;
  const pos = positionAt(cfg.route, b.distanceM);
  let socSum = 0;
  const cellVoltages = new Array<number>(cfg.seriesCells);
  for (let i = 0; i < cfg.seriesCells; i++) {
    cellVoltages[i] = b.cellVoltagesV[i] + SENSOR.cellVoltageV * noise[i];
    socSum += b.cellSoc[i];
  }
  b.reading = {
    batteryId: cfg.id,
    brand: cfg.brand,
    ts: SIM.epochMs + b.tS * 1000,
    cellVoltages,
    current: b.currentA + SENSOR.currentA * noise[16],
    coreTemp: b.coreTempC + SENSOR.coreTempC * noise[17],
    ambientTemp: b.ambientC + SENSOR.ambientTempC * noise[18],
    soc: clamp(socSum / cfg.seriesCells + SENSOR.soc * noise[19], 0, 1),
    lat: pos.lat,
    lng: pos.lng,
    cycleCount: Math.floor(b.efc),
  };
}

/**
 * Advance one battery by one physics tick (SIM.tickS), in place.
 *
 * The number of random draws per call is constant (never conditional), so two
 * runs of the same seed stay bit-identical until a fault or control input
 * actually changes the physics.
 */
export function stepBattery(b: BatteryState, env: Environment, control: BatteryControl = NO_CONTROL): void {
  const dt = SIM.tickS;
  const cfg = b.config;
  const n = cfg.seriesCells;

  for (let k = 0; k < Z_COUNT; k++) Z[k] = nextNormal(b.rng);
  const u1 = nextU(b.rng);
  const u2 = nextU(b.rng);
  const u3 = nextU(b.rng);

  const ambient = ambientAt(env, b.tS + 0.5 * dt, cfg.microclimateC);
  const capNomAh = cfg.groupCapacityAh;

  // Resistances at the current core temperature and health.
  const rFactor = r0Factor(b.coreTempC, b.soh);
  let r0Pack = 0;
  for (let i = 0; i < n; i++) {
    R0[i] = cfg.r0GroupOhm * cfg.r0Var[i] * rFactor;
    r0Pack += R0[i];
  }

  // ---- Requested pack current (+ discharge, - charge) ----
  const vPackPrev = Math.max(b.packVoltageV, 30);
  let iReq = 0;
  let speedNext = 0;
  let distanceNext = b.distanceM;

  if (b.mode === 'riding' && control.parked !== true) {
    const load = b.load;
    const vBase = cfg.cruiseMs * load.speedScale * (1 + 0.35 * Math.sin(b.distanceM / 700 + cfg.speedPhase));
    if (b.stopLeftS > 0) b.stopLeftS = Math.max(0, b.stopLeftS - dt);
    else if (u1 < VEHICLE.stopProbPerTick) {
      b.stopLeftS = VEHICLE.stopMinS + (VEHICLE.stopMaxS - VEHICLE.stopMinS) * u2;
    }
    const vTarget = b.stopLeftS > 0 ? 0 : vBase;
    const dvMax = VEHICLE.maxAccelMs2 * dt;
    speedNext = clamp(
      b.speedMs + VEHICLE.speedAlpha * (vTarget - b.speedMs) + (vTarget > 0 ? VEHICLE.speedNoiseMs * Z[20] : 0),
      Math.max(0, b.speedMs - dvMax),
      Math.min(VEHICLE.vMaxMs, b.speedMs + dvMax),
    );
    if (b.bmsTripped) speedNext = 0; // contactor open: the bike coasts to a stop
    const vAvg = 0.5 * (b.speedMs + speedNext);
    distanceNext = b.distanceM + vAvg * dt;
    const grade = gradeAt(cfg.gradePhases, b.distanceM + 0.5 * vAvg * dt, {
      grade: load.climbGrade,
      duty: load.climbDuty,
    });
    const wheelW = wheelPowerW({
      massKg: VEHICLE.vehicleKg + VEHICLE.riderKg + load.payloadKg,
      v0Ms: b.speedMs,
      v1Ms: speedNext,
      grade,
      ambientC: ambient,
      dtS: dt,
    });
    iReq = batteryPowerW(wheelW, vPackPrev) / vPackPrev;
    if (iReq > 0) iReq *= 1 - clamp(control.derate, 0, 0.5);
  } else if (b.mode === 'charging') {
    let vMaxPrev = 0;
    for (let i = 0; i < n; i++) if (b.cellVoltagesV[i] > vMaxPrev) vMaxPrev = b.cellVoltagesV[i];
    const taper = clamp(
      (CHARGING.fullV - vMaxPrev) / (CHARGING.fullV - CHARGING.taperStartV),
      CHARGING.minTaper,
      1,
    );
    iReq = -(b.load.chargeCRate * capNomAh * b.soh * taper * clamp(control.chargeCurrentScale, 0, 1));
  } else {
    iReq = VEHICLE.auxW / vPackPrev;
  }

  if (b.bmsTripped) iReq = 0;
  const iA = clamp(iReq, -Math.max(CHARGING.cRate, b.load.chargeCRate) * capNomAh, VEHICLE.maxDischargeC * capNomAh);

  // ---- Internal short in one cell group ----
  let iShort = 0;
  let rShort = Number.POSITIVE_INFINITY;
  let shortCell = -1;
  if (b.fault !== null && b.tS >= b.fault.onsetS) {
    const f = b.fault;
    shortCell = f.cell;
    rShort = Math.max(f.rShortMinOhm, f.rShortOhm0 * Math.exp(-(b.tS - f.onsetS) / f.tauS));
    if (b.cellSoc[shortCell] > 0) {
      iShort = Math.max(
        0,
        (ocv(b.cellSoc[shortCell]) - R0[shortCell] * iA - b.cellVrc[shortCell]) / (rShort + R0[shortCell]),
      );
    }
  }

  // ---- Cells: RC branch, coulomb counting, terminal voltage ----
  let vPack = 0;
  let socSum = 0;
  for (let i = 0; i < n; i++) {
    const iCell = i === shortCell ? iShort : 0;
    const capAh = capNomAh * b.soh * cfg.capVar[i];
    b.cellVrc[i] = stepRc(b.cellVrc[i], CELL.r1Ratio * R0[i], iA, dt);
    b.cellSoc[i] = clamp(b.cellSoc[i] - ((iA + iCell) * dt) / 3600 / capAh, 0, 1);
    const v = terminalVoltage(ocv(b.cellSoc[i]), iA + iCell, R0[i], b.cellVrc[i]);
    b.cellVoltagesV[i] = v;
    vPack += v;
    socSum += b.cellSoc[i];
  }

  // ---- Heat: I^2 R0 plus the extra heat of the short, then the lumped thermal step ----
  const qFault =
    shortCell >= 0 ? iShort * iShort * rShort + R0[shortCell] * (2 * iA * iShort + iShort * iShort) : 0;
  const heatW = iA * iA * r0Pack + qFault;

  // ---- Aging at the temperature the pack had during this step ----
  const dEfc = (Math.abs(iA) * dt) / 3600 / (2 * capNomAh);
  b.soh = Math.max(0.5, b.soh - fadePerEfc(b.coreTempC) * dEfc);
  b.efc += dEfc;

  b.coreTempC = thermalStep(
    b.coreTempC,
    heatW,
    ambient,
    dt,
    cfg.thermalCapacityJPerK,
    cfg.thermalConductanceWPerK,
  ).tempC;

  // ---- Traditional BMS: passive cut-off ----
  const tEnd = b.tS + dt;
  if (!b.bmsTripped && b.coreTempC >= BMS.tripTempC) {
    b.bmsTripped = true;
    b.bmsTrippedAtS ??= tEnd;
  } else if (b.bmsTripped && b.coreTempC < BMS.releaseTempC) {
    b.bmsTripped = false;
  }

  // ---- Bookkeeping ----
  b.tS = tEnd;
  b.currentA = iA;
  b.packVoltageV = vPack;
  b.ambientC = ambient;
  b.r0PackOhm = r0Pack;
  b.qFaultW = qFault;
  b.shortCurrentA = iShort;
  b.speedMs = speedNext;
  b.distanceM = distanceNext;

  // ---- Mode transitions ----
  const socMean = socSum / n;
  if (b.mode === 'riding' && socMean < BMS.lowSoc) {
    b.speedMs = 0;
    if (b.load.autoCharge) b.mode = 'charging';
    else {
      b.mode = 'idle';
      b.idleLeftS = 1e12;
    }
  } else if (b.mode === 'charging' && socMean >= CHARGING.endSoc) {
    b.mode = 'idle';
    b.idleLeftS = CHARGING.idleMinS + (CHARGING.idleMaxS - CHARGING.idleMinS) * u3;
  } else if (b.mode === 'idle') {
    b.idleLeftS -= dt;
    if (b.idleLeftS <= 0) b.mode = socMean > BMS.lowSoc + 0.05 ? 'riding' : 'charging';
  }

  sense(b, Z);
}

export function truthOf(b: BatteryState): BatteryTruth {
  return {
    batteryId: b.config.id,
    tS: b.tS,
    mode: b.mode,
    soh: b.soh,
    efc: b.efc,
    r0PackOhm: b.r0PackOhm,
    coreTempC: b.coreTempC,
    qFaultW: b.qFaultW,
    shortCurrentA: b.shortCurrentA,
    faultActive: b.fault !== null && b.tS >= b.fault.onsetS,
    faultCell: b.fault?.cell ?? null,
    faultOnsetS: b.fault?.onsetS ?? null,
    bmsTripped: b.bmsTripped,
    bmsTrippedAtS: b.bmsTrippedAtS,
  };
}

/** Inject an internal short into a running battery (Sandbox). Consumes no random draws. */
export function injectFault(b: BatteryState, spec: Partial<FaultSpec> = {}): void {
  b.fault = {
    cell: spec.cell ?? b.config.faultCell,
    onsetS: spec.onsetS ?? b.tS,
    rShortOhm0: spec.rShortOhm0 ?? FAULT.rShortOhm0,
    rShortMinOhm: spec.rShortMinOhm ?? FAULT.rShortMinOhm,
    tauS: spec.tauS ?? FAULT.tauS,
  };
}

export const cloneBattery = (b: BatteryState): BatteryState => structuredClone(b);
