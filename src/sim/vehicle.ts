// Road-load power model of the bike + rider + cargo.
import { PHYS, VEHICLE } from './params';

/** Air density (kg/m^3) at ambient temperature and sea-level pressure. */
export const airDensity = (ambientC: number): number => 101325 / (287.05 * (ambientC + PHYS.kelvin));

export interface PowerInput {
  massKg: number;
  /** Speed at the start and end of the step, m/s. */
  v0Ms: number;
  v1Ms: number;
  /** Road grade (rise/run). */
  grade: number;
  ambientC: number;
  dtS: number;
}

/** Mechanical power needed at the wheel averaged over the step, W (negative = braking). */
export function wheelPowerW(p: PowerInput): number {
  const vAvg = 0.5 * (p.v0Ms + p.v1Ms);
  const theta = Math.atan(p.grade);
  const rolling = p.massKg * PHYS.gravity * VEHICLE.crr * Math.cos(theta);
  const slope = p.massKg * PHYS.gravity * Math.sin(theta);
  const aero = 0.5 * airDensity(p.ambientC) * VEHICLE.cdA * vAvg * vAvg;
  // Kinetic-energy change over the step (exact, not v * dv/dt at a point).
  const inertia = (0.5 * p.massKg * (p.v1Ms * p.v1Ms - p.v0Ms * p.v0Ms)) / p.dtS;
  return (rolling + slope + aero) * vAvg + inertia;
}

/** Battery-side electrical power for a given wheel power, W (negative = regenerating). */
export function batteryPowerW(wheelW: number, packVoltageV: number): number {
  if (wheelW >= 0) return wheelW / VEHICLE.etaDrive + VEHICLE.auxW;
  const regenW = Math.max(wheelW * VEHICLE.etaRegen, -VEHICLE.regenMaxA * packVoltageV);
  return regenW + VEHICLE.auxW;
}
