import type { Brand } from '@/adapters';
import type { TimelineSpec } from '@/eval/timeline';
import { DEFAULT_POLICY, type InterventionPolicy } from '@/intervention';

export const AB_SCENARIOS = ['severeHeatLoad', 'heatwave43'] as const;
export type AbScenario = (typeof AB_SCENARIOS)[number];

export const AB_INTERVENTIONS = ['full', 'derateOnly'] as const;
export type AbIntervention = (typeof AB_INTERVENTIONS)[number];

/** Fixed demo seed: every replay of the same choices is identical. */
export const AB_SEED = 202;
export const AB_DURATION_S = 2400;

/** Power cut only: the swap is never carried out, so the pack stays on the bike. */
const DERATE_ONLY_POLICY: InterventionPolicy = { ...DEFAULT_POLICY, swapHandlingS: 1e9, fallbackSwapDelayS: 1e9 };

export function abSpec(scenario: AbScenario, brand: Brand, intervention: AbIntervention): Omit<TimelineSpec, 'mode'> {
  return {
    scenario,
    seed: AB_SEED,
    brand,
    durationS: AB_DURATION_S,
    policy: intervention === 'full' ? DEFAULT_POLICY : DERATE_ONLY_POLICY,
  };
}
