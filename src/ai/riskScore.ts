// Risk Score 0-100 with a per-module breakdown.
//
// Each module reports a severity s in [0, 1]. A module's weight w is the largest
// score it can produce ON ITS OWN, and modules combine like independent
// contributors to risk (noisy-OR):
//
//     score = 100 * (1 - prod_m (1 - w_m * s_m))
//
// so thermal or voltage evidence alone can reach "danger", overload and ageing
// alone cannot, and two moderate signals add up to more than either. The score is
// split back into contributions exactly, in the log domain:
//
//     L_m = -ln(1 - w_m * s_m),  contribution_m = score * L_m / sum(L)
//
// which always sums to the score, so the UI can show who is responsible for it.
import { RISK_LEVELS, RISK_RANK, type RiskLevel } from '../lib/riskLevels';
import { AI_CONFIG } from './config';
import type { LevelChange, RiskOutput, Severities } from './types';

// 0 - ln(...) rather than -ln(...): with no evidence ln(1) = 0 and a bare minus would give -0.
const logOdds = (weight: number, severity: number): number => 0 - Math.log(1 - weight * severity);

export function combineRisk(sev: Severities): Omit<RiskOutput, 'level'> {
  const w = AI_CONFIG.risk.weights;
  const lThermal = logOdds(w.thermal, sev.thermal);
  const lVoltage = logOdds(w.voltage, sev.voltage);
  const lOverload = logOdds(w.overload, sev.overload);
  const lHealth = logOdds(w.health, sev.health);
  const total = lThermal + lVoltage + lOverload + lHealth;
  const score = 100 * (1 - Math.exp(-total));
  const share = total > 0 ? score / total : 0;
  return {
    score,
    contributions: {
      thermal: lThermal * share,
      voltage: lVoltage * share,
      overload: lOverload * share,
      health: lHealth * share,
    },
  };
}

/** The level a score falls in, ignoring hysteresis. */
export function levelFromScore(score: number): RiskLevel {
  const [watch, warning, danger] = AI_CONFIG.risk.levelThresholds;
  return score >= danger ? 'danger' : score >= warning ? 'warning' : score >= watch ? 'watch' : 'safe';
}

/** Score at which a level is entered (0 for "safe"). */
export function entryThreshold(level: RiskLevel): number {
  return level === 'safe' ? 0 : AI_CONFIG.risk.levelThresholds[RISK_RANK[level] - 1];
}

export interface LevelTracker {
  level: RiskLevel;
  /** When the score first fell far enough below the current level's entry threshold; null if it has not. */
  belowSince: number | null;
}

/**
 * Raise the level at once; lower it only after the score has stayed `hysteresis`
 * points below the entry threshold for `dwellS`, so a score hovering at a
 * boundary does not flicker between levels.
 */
export function updateLevel(t: LevelTracker, score: number, ts: number): LevelChange | null {
  const raw = levelFromScore(score);
  const rawRank = RISK_RANK[raw];
  const curRank = RISK_RANK[t.level];

  if (rawRank > curRank) {
    const from = t.level;
    t.level = raw;
    t.belowSince = null;
    return { from, to: raw };
  }
  if (rawRank < curRank && score < entryThreshold(t.level) - AI_CONFIG.risk.hysteresis) {
    t.belowSince ??= ts;
    if (ts - t.belowSince >= AI_CONFIG.risk.dwellS) {
      const from = t.level;
      t.level = RISK_LEVELS[rawRank];
      t.belowSince = null;
      return { from, to: t.level };
    }
    return null;
  }
  t.belowSince = null;
  return null;
}
