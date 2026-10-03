/**
 * Physical parameters of the simulator.
 *
 * EVERY value here is an ASSUMPTION for the PoC (CLAUDE.md section 3, rule 6):
 * chosen to be physically plausible for a 16S NMC 21700 e-moped pack, not fitted
 * to any real vendor's data. Units are in the field name or the comment. They
 * will be surfaced in the UI as the "formulas and assumptions" panel in a later stage.
 */
import type { Brand } from '../adapters/schema';

export const PHYS = {
  /** J/(mol K) */
  gasConstant: 8.314462618,
  kelvin: 273.15,
  /** m/s^2 */
  gravity: 9.80665,
} as const;

export const SIM = {
  /** Physics step, in simulated seconds (CLAUDE.md: telemetry every 5 s of simulated time). */
  tickS: 5,
  /** Time zero of the simulation: 2026-06-15 12:00 local (UTC+7) = 05:00 UTC. */
  epochMs: Date.UTC(2026, 5, 15, 5, 0, 0),
  /** Local clock hour at tS = 0. */
  startLocalHour: 12,
} as const;

/**
 * Open-circuit voltage of one NMC cell vs state of charge. Generic NMC-like
 * curve (monotone, 3.0 V empty to 4.2 V full), linearly interpolated.
 */
export const OCV_TABLE: readonly (readonly [number, number])[] = [
  [0.0, 3.0],
  [0.05, 3.35],
  [0.1, 3.5],
  [0.2, 3.6],
  [0.3, 3.66],
  [0.4, 3.72],
  [0.5, 3.8],
  [0.6, 3.88],
  [0.7, 3.96],
  [0.8, 4.04],
  [0.9, 4.12],
  [1.0, 4.2],
];

/** Equivalent-circuit (1-RC) and per-cell parameters. */
export const CELL = {
  seriesCells: 16,
  /** Ah per 21700 cell. */
  cellCapacityAh: 5,
  /** ohm, DC resistance of one cell at 25 degC when new. A group of p parallel cells has this / p. */
  r0CellOhm: 0.016,
  /** R1 = r1Ratio * R0. */
  r1Ratio: 0.5,
  /** s, RC polarisation time constant. */
  tauRcS: 40,
  /** J/mol, activation energy of the resistance's temperature dependence (resistance falls as the cell warms). */
  r0ActivationJPerMol: 20000,
  /** K, reference temperature for R0 (25 degC). */
  r0RefK: 298.15,
  /** R0 grows with age as 1 + gamma * (1 - SOH). */
  ageResistanceGamma: 4,
  /** Unit-to-unit spread (1 sigma, relative) of per-cell resistance and capacity. */
  r0VarSigma: 0.03,
  capVarSigma: 0.01,
  /** Spread of per-cell state of charge at pack start (absolute fraction). */
  socSpreadSigma: 0.004,
} as const;

/** Lumped thermal model: C dT/dt = I^2 R0 - hA (T - T_amb) + Q_fault. */
export const THERMAL = {
  /**
   * J/K, heat capacity of a whole 16S5P pack: 80 cells x ~70 g (21700) = 5.6 kg plus
   * ~1.5 kg of housing, busbars and BMS, at roughly 1 kJ/(kg K) = about 7 kJ/K.
   */
  capacityJPerK: 7000,
  /** W/K, conductance to the environment of a pack sealed in a vehicle compartment. */
  conductanceWPerK: 3.0,
  /** Unit-to-unit spread: hA uniform within +/- this fraction, C within +/- capacitySpread. */
  conductanceSpread: 0.1,
  capacitySpread: 0.05,
} as const;

/**
 * Arrhenius capacity fade. Rate per equivalent full cycle (EFC) is
 *   k(T) = kRef * exp(-Ea/R * (1/T - 1/Tref))
 * which is A*exp(-Ea/(R*T)) with A = kRef*exp(Ea/(R*Tref)).
 * Ea = 20 kJ/mol is the low end of the literature range for cycling aging (so the
 * temperature effect is conservative); at this value 43 degC ages ~1.39x faster than 30 degC.
 * No C-rate or depth-of-discharge dependence is modelled.
 */
export const AGING = {
  /** SOH fraction lost per EFC at the reference temperature (1000 EFC to 80% SOH at 30 degC). */
  kRefPerEfc: 2e-4,
  eaJPerMol: 20000,
  refTempC: 30,
  /** SOH below this is treated as end of life for lifetime projections. */
  eolSoh: 0.8,
} as const;

/** Vehicle and rider, for the road-load power model. */
export const VEHICLE = {
  /** kg, bike including pack. */
  vehicleKg: 115,
  riderKg: 65,
  /** Rolling resistance coefficient. */
  crr: 0.012,
  /** m^2, drag area Cd * A. */
  cdA: 0.55,
  /** Battery-to-wheel efficiency when driving. */
  etaDrive: 0.8,
  /** Wheel-to-battery efficiency in regenerative braking. */
  etaRegen: 0.5,
  /** A, regen charge current limit. */
  regenMaxA: 8,
  /** W, controller + BMS + GPS/4G module draw. */
  auxW: 30,
  /** BMS discharge limit in C of the nominal group capacity. */
  maxDischargeC: 2.8,
  vMaxMs: 55 / 3.6,
  /** Mean cruising speed across drivers, km/h (mean, sigma, floor, ceiling). */
  cruiseKmh: { mean: 26, sigma: 4, min: 15, max: 40 },
  /** Probability per 5 s tick of a stop (traffic light, hand-off), and its length in s. */
  stopProbPerTick: 0.01,
  stopMinS: 15,
  stopMaxS: 45,
  /** First-order pull toward the target speed each tick, and speed noise (m/s). */
  speedAlpha: 0.35,
  speedNoiseMs: 0.8,
  /** m/s^2, comfortable acceleration cap. */
  maxAccelMs2: 1.2,
  /** Cargo carried by a normal delivery rider, kg (uniform). */
  payloadKg: { min: 0, max: 40 },
} as const;

/** Traditional BMS: passive protection (CLAUDE.md: cuts at 65 degC). */
export const BMS = {
  tripTempC: 65,
  /** The cut-off releases once the pack has cooled below this. */
  releaseTempC: 55,
  /** Pack is parked/charged below this mean SOC. */
  lowSoc: 0.1,
} as const;

/** Constant-current / taper charging. */
export const CHARGING = {
  cRate: 0.5,
  /** Cell voltage at which the taper starts, and the full-charge cell voltage. */
  taperStartV: 4.15,
  fullV: 4.2,
  /** Lowest fraction of the CC current during taper. */
  minTaper: 0.05,
  /** Charging stops once the mean SOC reaches this. */
  endSoc: 0.985,
  /** Parked time between charging and riding again, s (uniform). */
  idleMinS: 120,
  idleMaxS: 600,
} as const;

/**
 * Default internal soft short (a dendrite slowly bridging one cell group):
 * R_sc(t) = max(rShortMinOhm, rShortOhm0 * exp(-(t - onset) / tauS)).
 * The short both self-discharges that cell group and heats the pack.
 */
export const FAULT = {
  rShortOhm0: 20,
  rShortMinOhm: 0.25,
  tauS: 1200,
} as const;

/** Measurement noise (1 sigma) of the pack's own sensors. */
export const SENSOR = {
  cellVoltageV: 0.0008,
  currentA: 0.15,
  coreTempC: 0.08,
  ambientTempC: 0.2,
  soc: 0.004,
} as const;

/** Per-brand pack configuration and reporting behaviour (fictional vendors). */
export interface BrandSpec {
  /** Cells in parallel per series group; sets capacity and resistance. */
  parallelCells: number;
  /** Multipliers on the shared thermal capacity / conductance (bigger pack, bigger housing). */
  thermalCScale: number;
  thermalHAScale: number;
  /** Telemetry cadence in physics ticks (1 tick = 5 s). */
  emitEveryTicks: number;
  /** Display hint only; the sim never claims to model a real vendor's pack. */
  displayHint: string;
}

export const BRAND_SPECS: Record<Brand, BrandSpec> = {
  A: { parallelCells: 5, thermalCScale: 1.0, thermalHAScale: 1.0, emitEveryTicks: 1, displayHint: 'Selex-like' },
  B: { parallelCells: 6, thermalCScale: 1.2, thermalHAScale: 1.15, emitEveryTicks: 2, displayHint: 'Dat Bike-like' },
  C: { parallelCells: 4, thermalCScale: 0.85, thermalHAScale: 0.9, emitEveryTicks: 3, displayHint: 'VinFast-like' },
};

/** City boxes (degrees) used for pseudo-routes, and the metres-per-degree used to walk them. */
export const CITY_BOX = {
  hcmc: { latMin: 10.72, latMax: 10.86, lngMin: 106.62, lngMax: 106.78 },
  hanoi: { latMin: 20.98, latMax: 21.08, lngMin: 105.78, lngMax: 105.9 },
} as const;
export type City = keyof typeof CITY_BOX;

export const METRES_PER_DEG_LAT = 111_320;
export const ROUTE_LEGS = 40;

/** Initial pack health distribution across a fleet (mean, sigma, min, max of SOH). */
export const FLEET_SOH = { mean: 0.9, sigma: 0.05, min: 0.7, max: 1 } as const;
