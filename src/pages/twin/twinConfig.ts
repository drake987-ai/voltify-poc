import type { TimelineSpec } from '@/eval/timeline';

export const TWIN_CASES = ['healthy', 'overload', 'shortCircuit', 'weakCell', 'aged'] as const;
export type TwinCase = (typeof TWIN_CASES)[number];

/** Each case is one battery observed by the AI (no intervention), with a fixed seed so it replays identically. */
export const TWIN_SPECS: Record<TwinCase, TimelineSpec> = {
  healthy: { scenario: 'baseline', seed: 301, brand: 'A', durationS: 3000, mode: 'observe' },
  overload: { scenario: 'severeHeatLoad', seed: 202, brand: 'A', durationS: 2400, mode: 'observe' },
  shortCircuit: {
    scenario: 'baseline',
    seed: 301,
    brand: 'B',
    durationS: 4200,
    mode: 'observe',
    inject: { atS: 1200, fault: { rShortOhm0: 20, rShortMinOhm: 0.08, tauS: 300 } },
  },
  weakCell: { scenario: 'cellImbalance', seed: 301, brand: 'C', durationS: 3000, mode: 'observe' },
  aged: { scenario: 'agedHigh', seed: 301, brand: 'A', durationS: 3000, mode: 'observe' },
};
