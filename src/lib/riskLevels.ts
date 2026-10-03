// Pure data (no React, no icons) so the AI engine and Web Worker can import it
// without pulling UI code into their bundle.
export const RISK_LEVELS = ['safe', 'watch', 'warning', 'danger'] as const;

export type RiskLevel = (typeof RISK_LEVELS)[number];

/** Higher rank = more severe. Used for sorting alerts. */
export const RISK_RANK: Record<RiskLevel, number> = {
  safe: 0,
  watch: 1,
  warning: 2,
  danger: 3,
};
