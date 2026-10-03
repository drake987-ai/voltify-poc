// Sandbox Mode: the viewer's sliders become a scenario, and the scenario runs through the same
// A/B pipeline as the BMS-vs-Voltify screen (a traditional BMS beside Voltify, same seed).
import type { Brand } from '../../adapters';
import { SHORT_FAULTS } from '../../eval/suites';
import type { TimelineSpec } from '../../eval/timeline';
import { DEFAULT_POLICY, type InterventionPolicy } from '../../intervention';
import type { ScenarioSpec } from '../../sim/scenarios';

export const SANDBOX_SHORT_SEVERITIES = ['severe', 'moderate', 'mild'] as const;
export type SandboxShortSeverity = (typeof SANDBOX_SHORT_SEVERITIES)[number];

export const SANDBOX_DURATIONS_MIN = [40, 60, 90] as const;
export type SandboxDurationMin = (typeof SANDBOX_DURATIONS_MIN)[number];

export interface SandboxParams {
  /** Highest air temperature of the day, degC (the run starts around noon). */
  ambientPeakC: number;
  /** Cargo and rider on top of the bike, kg. */
  payloadKg: number;
  /** Steepness of the climbs, percent. */
  climbGradePct: number;
  /** Share of the ride spent climbing, percent. */
  climbDutyPct: number;
  /** Riding pace relative to normal. */
  speedScale: number;
  /** State of health of the pack at the start, percent. */
  sohPct: number;
  /** How well the pack sheds heat: 1 is normal, 0.25 is sealed in a sun-baked compartment. */
  coolingScale: number;
  /** How much warmer than the air the pack is when the run starts, degC (it has just come off a hot charge). */
  startWarmC: number;
  /** One cell weaker than the rest. */
  weakCell: boolean;
  /** An internal short that starts during the run. */
  short: { on: boolean; onsetMin: number; severity: SandboxShortSeverity };
  brand: Brand;
  /** Voltify cuts power and has the pack swapped, or only cuts power. */
  intervention: 'full' | 'derateOnly';
  seed: number;
  durationMin: SandboxDurationMin;
}

/** An ordinary hot-season afternoon: nothing wrong, so the two sides stay identical. */
export const DEFAULT_SANDBOX: SandboxParams = {
  ambientPeakC: 35,
  payloadKg: 20,
  climbGradePct: 3,
  climbDutyPct: 10,
  speedScale: 1,
  sohPct: 90,
  coolingScale: 1,
  startWarmC: 4,
  weakCell: false,
  short: { on: false, onsetMin: 10, severity: 'severe' },
  brand: 'A',
  intervention: 'full',
  seed: 202,
  durationMin: 60,
};

/** Ranges of the sliders; also used to clamp anything that arrives from elsewhere. */
export const SANDBOX_RANGES = {
  ambientPeakC: { min: 28, max: 48, step: 1 },
  payloadKg: { min: 0, max: 120, step: 5 },
  climbGradePct: { min: 0, max: 10, step: 1 },
  climbDutyPct: { min: 0, max: 100, step: 5 },
  speedScale: { min: 0.8, max: 1.4, step: 0.05 },
  sohPct: { min: 60, max: 100, step: 1 },
  coolingScale: { min: 0.2, max: 1.2, step: 0.05 },
  startWarmC: { min: 0, max: 12, step: 1 },
  onsetMin: { min: 5, max: 40, step: 1 },
  seed: { min: 1, max: 999_999, step: 1 },
} as const;

export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** The scenarios of the brief, as starting points for the sliders. */
export const PRESET_IDS = ['ordinary', 'heatwave43', 'heavyClimb', 'weakCell', 'internalShort', 'aged', 'worst'] as const;
export type PresetId = (typeof PRESET_IDS)[number];

export const PRESETS: Record<PresetId, Partial<SandboxParams>> = {
  ordinary: {},
  heatwave43: { ambientPeakC: 43 },
  heavyClimb: { payloadKg: 70, climbGradePct: 6, climbDutyPct: 35 },
  weakCell: { weakCell: true },
  internalShort: { short: { on: true, onsetMin: 10, severity: 'severe' } },
  aged: { sohPct: 72 },
  // The load-driven worst day of the BMS-vs-Voltify screen.
  worst: { ambientPeakC: 43, payloadKg: 100, climbGradePct: 8, climbDutyPct: 60, speedScale: 1.25, sohPct: 70, coolingScale: 0.25, startWarmC: 8, durationMin: 40 },
};

/** A preset starts from the ordinary day, whatever the sliders held before; the brand, the seed and the intervention stay as chosen. */
export function applyPreset(id: PresetId, base: SandboxParams = DEFAULT_SANDBOX): SandboxParams {
  return { ...DEFAULT_SANDBOX, ...PRESETS[id], seed: base.seed, brand: base.brand, intervention: base.intervention };
}

/** The sliders as a full scenario for the simulator. */
export function scenarioOf(p: SandboxParams): ScenarioSpec {
  const r = SANDBOX_RANGES;
  const spec: ScenarioSpec = {
    id: 'sandbox',
    env: { ambientMinC: clamp(p.ambientPeakC, r.ambientPeakC.min, r.ambientPeakC.max) - 12, ambientMaxC: clamp(p.ambientPeakC, r.ambientPeakC.min, r.ambientPeakC.max) },
    load: {
      payloadKg: clamp(p.payloadKg, r.payloadKg.min, r.payloadKg.max),
      climbGrade: clamp(p.climbGradePct, r.climbGradePct.min, r.climbGradePct.max) / 100,
      climbDuty: clamp(p.climbDutyPct, r.climbDutyPct.min, r.climbDutyPct.max) / 100,
      speedScale: clamp(p.speedScale, r.speedScale.min, r.speedScale.max),
      // The pack keeps working for the whole run instead of stopping to charge.
      autoCharge: false,
    },
    soh: clamp(p.sohPct, r.sohPct.min, r.sohPct.max) / 100,
    socRange: [0.92, 0.98],
    coreTempAboveAmbientC: clamp(p.startWarmC, r.startWarmC.min, r.startWarmC.max),
    coolingScale: clamp(p.coolingScale, r.coolingScale.min, r.coolingScale.max),
  };
  if (p.weakCell) spec.weakCell = { capScale: 0.82, r0Scale: 1.7 };
  if (p.short.on) {
    spec.fault = { onsetS: clamp(p.short.onsetMin, r.onsetMin.min, r.onsetMin.max) * 60, ...SHORT_FAULTS[p.short.severity] };
  }
  return spec;
}

/** Derate only: the power cut is sent but the swap never happens (as on the BMS-vs-Voltify screen). */
const DERATE_ONLY_POLICY: InterventionPolicy = { ...DEFAULT_POLICY, swapHandlingS: 1e9, fallbackSwapDelayS: 1e9 };

export function sandboxSpec(p: SandboxParams): Omit<TimelineSpec, 'mode'> {
  return {
    scenario: scenarioOf(p),
    seed: Math.round(clamp(p.seed, SANDBOX_RANGES.seed.min, SANDBOX_RANGES.seed.max)),
    brand: p.brand,
    durationS: p.durationMin * 60,
    policy: p.intervention === 'full' ? DEFAULT_POLICY : DERATE_ONLY_POLICY,
  };
}
