import type { Brand } from '../adapters/schema';
import type { RiskLevel } from '../lib/riskLevels';

export type RiskModule = 'thermal' | 'voltage' | 'overload' | 'health';

export interface ThermalOutput {
  /** Filtered core temperature, degC. */
  tempC: number;
  /** Unexplained heat power (W): what the standard thermal model cannot account for. */
  unexplainedHeatW: number;
  unexplainedHeatSigmaW: number;
  /** How fast the unexplained heat has recently been growing, W/min (0 when absent or falling). */
  heatRateWPerMin: number;
  /** Heating rate the standard model expects from load and weather, K/min. */
  expectedDTdtKPerMin: number;
  /** Heating rate actually inferred (expected + unexplained), K/min. */
  measuredDTdtKPerMin: number;
  /** measured - expected, K/min (this is the "residual" of CLAUDE.md section 5). */
  residualDTdtKPerMin: number;
  /** Seconds to reach the 65 degC limit by straight-line extrapolation of the current rate; null = not heating. */
  etaLinearS: number | null;
  /** Same, by projecting the thermal model forward with the heat growing at its recent rate; null = no crossing within 2 h. */
  etaModelS: number | null;
  /** The earlier of the two (this is the live "lead time"); null = no projected crossing. */
  etaToLimitS: number | null;
  /** The temperature a healthy pack of this type would be at (open-loop nominal twin). */
  nominalTempC: number;
  /** Seconds the unexplained heat has stayed above its warning level. */
  persistenceS: number;
}

export interface VoltageOutput {
  spreadMv: number;
  minCellV: number;
  maxCellV: number;
  /** Cell furthest below the group (index) and how far below the group median, mV. */
  worstCell: number;
  /** Cell moving furthest away from the group (index). */
  driftCell: number;
  sagMv: number;
  /** The same sag as an equivalent charge imbalance (% SOC): mV divided by the OCV slope at the present SOC. */
  sagSocPct: number;
  /** Robust z-score of that sag across the cells. */
  sagZ: number;
  /** How far that cell has moved away from the group over the last ~25 min (mV, and as % SOC) and its robust z. */
  driftMv: number;
  driftSocPct: number;
  driftZ: number;
  /** Cell with the highest resistance relative to its neighbours, the excess (mOhm) and its robust z. */
  weakCell: number;
  weakExcessMOhm: number;
  weakZ: number;
  /** Frames the per-cell current fit has seen (it is trusted from ~30). */
  samples: number;
  /** Cell furthest above the group, mV (over-voltage / balancing). */
  riseMv: number;
  persistenceS: number;
}

export interface OverloadOutput {
  /** Core temperature the limit was evaluated at, degC. */
  tempC: number;
  charging: boolean;
  /** Instantaneous and RMS current in C of rated capacity. */
  cRate: number;
  cRateRms: number;
  /** Continuous C-rate the pack may carry at its present temperature. */
  limitC: number;
  /** RMS C-rate / limit: above 1 the pack is being worked past its derating curve. */
  ratio: number;
  hotCharge: boolean;
  /** Suggested discharge-power cut (0..0.3) and charging-current multiplier (0..1). */
  recommendedDerate: number;
  recommendedChargeScale: number;
}

export type SohClass = 'good' | 'fair' | 'weak';

export interface ImpedanceOutput {
  /** Pack DC resistance referred to 25 degC, in milliohm. */
  r25mOhm: number;
  sohEst: number;
  /** 0..1, grows with the number of informative updates. */
  confidence: number;
  updates: number;
  class: SohClass;
}

export interface Severities {
  thermal: number;
  voltage: number;
  overload: number;
  health: number;
}

export interface RiskOutput {
  /** 0..100 */
  score: number;
  level: RiskLevel;
  /** Points each module contributes; they sum to `score`. */
  contributions: Severities;
}

export type ActionCode = 'monitor' | 'derate' | 'swap' | 'isolate' | 'reduce_charge' | 'schedule_maintenance';

export interface RecommendedAction {
  code: ActionCode;
  /** derate: fraction of discharge power to cut; reduce_charge: charging-current multiplier. */
  value?: number;
}

export interface LevelChange {
  from: RiskLevel;
  to: RiskLevel;
}

/** Everything the engine knows about one battery after one telemetry sample. */
export interface Assessment {
  batteryId: string;
  brand: Brand;
  /** Epoch ms of the sample this is based on. */
  ts: number;
  /** True while the engine is still learning this pack (no alerts raised yet). */
  learning: boolean;
  observedS: number;
  /** 0..1 learning confidence. */
  confidence: number;
  thermal: ThermalOutput;
  voltage: VoltageOutput;
  overload: OverloadOutput;
  impedance: ImpedanceOutput;
  severities: Severities;
  risk: RiskOutput;
  actions: RecommendedAction[];
  /** Set only on the sample where the risk level changed. */
  event: LevelChange | null;
}

export type SignalCode =
  | 'unexplained_heat'
  | 'eta_to_limit'
  | 'core_temp'
  | 'cell_sag'
  | 'cell_drift'
  | 'weak_cell'
  | 'cell_voltage_limit'
  | 'overload_crate'
  | 'hot_charge'
  | 'low_soh';

/**
 * One reason behind a score (Explainable AI): which signal fired, its value
 * against the threshold where it starts to count, how many score points it
 * accounts for, and how much the engine trusts it.
 */
export interface Explanation {
  module: RiskModule;
  signal: SignalCode;
  value: number;
  unit: string;
  /** Value at which this signal starts to count, and where it saturates. */
  threshold: number;
  limit: number;
  /** Whether the signal is bad when above or below its threshold. */
  direction: 'above' | 'below';
  /** 0..1 severity of this signal alone. */
  severity: number;
  /** Share of the Risk Score attributed to this signal. */
  points: number;
  /** 0..1 confidence (learning progress and how long the evidence has persisted). */
  confidence: number;
  /** Which cell, for voltage signals. */
  cell?: number;
}
