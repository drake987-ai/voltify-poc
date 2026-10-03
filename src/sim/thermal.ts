// Lumped thermal model:  C dT/dt = Q - hA (T - T_amb),  Q = I^2 R0 + Q_fault.
// For piecewise-constant Q and T_amb the solution over one step is exact, so the
// integration is unconditionally stable at any step length.

export const timeConstantS = (capacityJPerK: number, conductanceWPerK: number): number =>
  capacityJPerK / conductanceWPerK;

/** Temperature the pack settles to if Q and ambient stayed constant forever. */
export const steadyStateTempC = (ambientC: number, heatW: number, conductanceWPerK: number): number =>
  ambientC + heatW / conductanceWPerK;

export interface ThermalStep {
  /** Core temperature at the end of the step, degC. */
  tempC: number;
  /** Time-averaged core temperature over the step, degC (used for energy accounting). */
  meanTempC: number;
}

export function thermalStep(
  tempC: number,
  heatW: number,
  ambientC: number,
  dtS: number,
  capacityJPerK: number,
  conductanceWPerK: number,
): ThermalStep {
  const tau = capacityJPerK / conductanceWPerK;
  const tSs = ambientC + heatW / conductanceWPerK;
  const decay = Math.exp(-dtS / tau);
  return {
    tempC: tSs + (tempC - tSs) * decay,
    meanTempC: tSs + (tempC - tSs) * (tau / dtS) * (1 - decay),
  };
}
