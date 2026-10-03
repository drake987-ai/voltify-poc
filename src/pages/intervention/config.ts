import type { CabinetSpec } from '@/eval/cabinet';
import type { Brand } from '@/adapters';

/** Fixed demo seed: every replay of the same choices is identical. */
export const INTERVENTION_SEED = 202;

/** The vehicle story plays at 1x, 10x or 60x; the whole sequence is a few minutes of simulated time. */
export const VEHICLE_SPEEDS = [1, 10, 60] as const;
export const VEHICLE_DEFAULT_SPEED = 10;
/** The phone keeps playing this long after the swap so the "done" screen can be read. */
export const VEHICLE_TAIL_S = 180;

/** A slow charge in a hot cabinet takes hours, so the cabinet story plays much faster. */
export const CABINET_SPEEDS = [150, 600, 2400] as const;
export const CABINET_DEFAULT_SPEED = 600;
/** Long enough for the reduced charge to reach full as well (CLAUDE.md section 5: with and without the intervention). */
export const CABINET_DURATION_S = 18_000;
/** The chart and the playback end this long after the last of the two charges finishes. */
export const CABINET_TAIL_S = 300;

export const cabinetSpec = (brand: Brand): CabinetSpec => ({
  seed: INTERVENTION_SEED,
  brand,
  durationS: CABINET_DURATION_S,
});
