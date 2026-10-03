// The four vital signs of a battery that a fleet manager reads (CLAUDE.md section 6, screen 4):
// charge left, health, safety / fire risk, and discharge performance. All derived from
// the AI's assessment and the latest telemetry only.
import type { Telemetry } from '../adapters/schema';
import { AI_CONFIG } from './config';
import { clamp } from './mathutil';
import { PACK_NOMINAL, resistanceTempFactor } from './nominal';
import type { Assessment, SohClass } from './types';
import type { RiskLevel } from '../lib/riskLevels';

export type RouteAdvice = 'long' | 'medium' | 'short';

export interface Vitals {
  /** Charge left. */
  soc: {
    pct: number;
    /** Estimated minutes of riding left at the recent load; null if the pack is barely loaded. */
    remainingMin: number | null;
    /** Time to tell the shipper to swap before the pack runs flat on the road. */
    swapSoon: boolean;
  };
  /** Health (how much of its original capacity the pack can still use). */
  health: {
    pct: number;
    class: SohClass;
    /** 0..1 */
    confidence: number;
    route: RouteAdvice;
  };
  /** Safety and fire risk. */
  safety: {
    score: number;
    level: RiskLevel;
    /** Minutes until the forecast crossing of the BMS limit; null if none is forecast. */
    etaMin: number | null;
  };
  /** How well the pack delivers power. */
  discharge: {
    /** 0..100 */
    score: number;
    /** Share of the drawn power that reaches the motor right now (null when the pack is barely loaded). */
    efficiencyPct: number | null;
    /** Heat lost in the pack's own resistance right now, W. */
    lossW: number;
    /** The three penalties that make up the score, each 0..1. */
    resistancePenalty: number;
    weakCellPenalty: number;
    balancePenalty: number;
    /** A balancing charge cycle would restore the performance (imbalance, not a safety problem). */
    needsBalancing: boolean;
  };
}

/** Penalty weights of the discharge-performance score (they sum to 1). */
export const DISCHARGE_WEIGHTS = { resistance: 0.5, weakCell: 0.25, balance: 0.25 } as const;

/** Resistance at which the resistance penalty reaches 1, as a multiple of the new pack's (SOH about 55 %). */
const RESISTANCE_FULL_PENALTY_RATIO = 2.2;

export function computeVitals(a: Assessment, t: Telemetry): Vitals {
  const nom = PACK_NOMINAL[a.brand];
  const imp = a.impedance;
  const v = a.voltage;
  const packV = t.cellVoltages.reduce((s, x) => s + x, 0);

  // 1) Charge left.
  const remainingAh = t.soc * nom.capacityAh * imp.sohEst;
  const recentA = a.overload.cRateRms * nom.capacityAh;
  const remainingMin = recentA > 1 ? (remainingAh / recentA) * 60 : null;

  // 2) Health, and where the pack should be used.
  const route: RouteAdvice = imp.class === 'good' ? 'long' : imp.class === 'fair' ? 'medium' : 'short';

  // 4) Discharge performance.
  const rNew = nom.r0PackOhm25 * 1000;
  const resistanceRatio = imp.r25mOhm / rNew;
  const resistancePenalty = clamp((resistanceRatio - 1) / (RESISTANCE_FULL_PENALTY_RATIO - 1), 0, 1);
  const weakCellPenalty = a.learning ? 0 : clamp(v.weakExcessMOhm / AI_CONFIG.voltage.weakFullMOhm, 0, 1);
  const balancePenalty = a.learning ? 0 : clamp(v.sagSocPct / AI_CONFIG.voltage.sagDangerPct, 0, 1);
  const score =
    100 *
    (1 -
      DISCHARGE_WEIGHTS.resistance * resistancePenalty -
      DISCHARGE_WEIGHTS.weakCell * weakCellPenalty -
      DISCHARGE_WEIGHTS.balance * balancePenalty);

  const loaded = t.current > 2;
  const rHot = (imp.r25mOhm / 1000) * resistanceTempFactor(t.coreTemp);
  const lossW = t.current * t.current * rHot;
  const efficiencyPct = loaded ? clamp(100 * (1 - (t.current * rHot) / Math.max(packV, 1)), 0, 100) : null;

  const imbalance =
    !a.learning && (v.weakExcessMOhm >= AI_CONFIG.voltage.weakWarnMOhm || v.sagSocPct >= AI_CONFIG.voltage.sagWarnPct);

  return {
    soc: { pct: t.soc * 100, remainingMin, swapSoon: t.soc < 0.2 || (remainingMin !== null && remainingMin < 15) },
    health: { pct: imp.sohEst * 100, class: imp.class, confidence: imp.confidence, route },
    safety: {
      score: a.risk.score,
      level: a.risk.level,
      etaMin: a.thermal.etaToLimitS === null ? null : a.thermal.etaToLimitS / 60,
    },
    discharge: {
      score,
      efficiencyPct,
      lossW,
      resistancePenalty,
      weakCellPenalty,
      balancePenalty,
      needsBalancing: imbalance && a.risk.level !== 'danger' && a.risk.level !== 'warning',
    },
  };
}
