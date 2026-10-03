// Explainable AI: turn an Assessment into the list of reasons behind its score.
// Each reason says which signal fired, its value against the threshold where it
// starts to count, the points of the Risk Score it accounts for, and how far the
// engine trusts it. The text shown to users is produced from this data by the UI
// (so it can be translated); nothing here is prose.
import { AI_CONFIG } from './config';
import { clamp } from './mathutil';
import { LIMIT_TEMP_C } from './nominal';
import { overloadSeverity, thermalSeverity, voltageSeverity } from './severity';
import type { Assessment, Explanation, RiskModule } from './types';

/** Directly measured quantities are trusted at the sensor's level from the first sample. */
const MEASURED_CONFIDENCE = 0.95;

type Draft = Omit<Explanation, 'points'>;

export function explainAssessment(a: Assessment): Explanation[] {
  const cfg = AI_CONFIG;
  const learned = a.confidence;
  const drafts: Draft[] = [];

  const th = thermalSeverity(a.thermal, a.confidence);
  const heatPersist = clamp(a.thermal.persistenceS / cfg.thermal.persistS, 0, 1);
  if (!a.learning) {
    drafts.push({
      module: 'thermal',
      signal: 'unexplained_heat',
      value: a.thermal.unexplainedHeatW,
      unit: 'W',
      threshold: cfg.thermal.warnW,
      limit: cfg.thermal.dangerW,
      direction: 'above',
      severity: th.heat,
      confidence: learned * heatPersist,
    });
    drafts.push({
      module: 'thermal',
      signal: 'eta_to_limit',
      value: a.thermal.etaToLimitS === null ? Number.POSITIVE_INFINITY : a.thermal.etaToLimitS / 60,
      unit: 'min',
      threshold: cfg.thermal.etaPointsMin[cfg.thermal.etaPointsMin.length - 1][0],
      limit: 0,
      direction: 'below',
      severity: th.eta,
      confidence: learned,
    });
  }
  drafts.push({
    module: 'thermal',
    signal: 'core_temp',
    value: a.thermal.tempC,
    unit: '°C',
    threshold: cfg.thermal.tempWarnC,
    limit: LIMIT_TEMP_C,
    direction: 'above',
    severity: th.temp,
    confidence: MEASURED_CONFIDENCE,
  });

  const vo = voltageSeverity(a.voltage);
  const voltPersist = clamp(a.voltage.persistenceS / cfg.voltage.persistS, 0, 1);
  if (!a.learning) {
    drafts.push({
      module: 'voltage',
      signal: 'cell_sag',
      value: a.voltage.sagSocPct,
      unit: '% SOC',
      threshold: cfg.voltage.sagWarnPct,
      limit: cfg.voltage.sagDangerPct,
      direction: 'above',
      severity: vo.sag,
      confidence: learned * voltPersist,
      cell: a.voltage.worstCell,
    });
    drafts.push({
      module: 'voltage',
      signal: 'cell_drift',
      value: a.voltage.driftSocPct,
      unit: '% SOC',
      threshold: cfg.voltage.driftWarnPct,
      limit: cfg.voltage.driftDangerPct,
      direction: 'above',
      severity: vo.drift,
      confidence: learned * voltPersist,
      cell: a.voltage.driftCell,
    });
  }
  if (!a.learning) {
    drafts.push({
      module: 'voltage',
      signal: 'weak_cell',
      value: a.voltage.weakExcessMOhm,
      unit: 'mΩ',
      threshold: cfg.voltage.weakWarnMOhm,
      limit: cfg.voltage.weakFullMOhm,
      direction: 'above',
      severity: vo.weak,
      confidence: learned * voltPersist,
      cell: a.voltage.weakCell,
    });
  }
  drafts.push({
    module: 'voltage',
    signal: 'cell_voltage_limit',
    value: a.voltage.minCellV < cfg.voltage.minCellV ? a.voltage.minCellV : a.voltage.maxCellV,
    unit: 'V',
    threshold: a.voltage.minCellV < cfg.voltage.minCellV ? cfg.voltage.minCellV : cfg.voltage.maxCellV,
    limit: a.voltage.minCellV < cfg.voltage.minCellV ? cfg.voltage.minCellV : cfg.voltage.maxCellV,
    direction: a.voltage.minCellV < cfg.voltage.minCellV ? 'below' : 'above',
    severity: vo.limit,
    confidence: MEASURED_CONFIDENCE,
  });

  const ov = overloadSeverity(a.overload);
  drafts.push({
    module: 'overload',
    signal: 'overload_crate',
    value: a.overload.ratio,
    unit: '×',
    threshold: cfg.overload.warnRatio,
    limit: cfg.overload.dangerRatio,
    direction: 'above',
    severity: ov.crate,
    confidence: MEASURED_CONFIDENCE,
  });
  drafts.push({
    module: 'overload',
    signal: 'hot_charge',
    value: a.overload.tempC,
    unit: '°C',
    threshold: cfg.overload.hotChargeC,
    limit: cfg.overload.hotChargeFullC,
    direction: 'above',
    severity: ov.hotCharge,
    confidence: MEASURED_CONFIDENCE,
  });

  if (!a.learning) {
    drafts.push({
      module: 'health',
      signal: 'low_soh',
      value: a.impedance.sohEst * 100,
      unit: '%',
      threshold: cfg.impedance.healthOkSoh * 100,
      limit: cfg.impedance.healthBadSoh * 100,
      direction: 'below',
      severity: a.severities.health / Math.max(a.impedance.confidence, 1e-9),
      confidence: a.impedance.confidence,
    });
  }

  // Split each module's points across its signals in proportion to their severity.
  const severitySum: Record<RiskModule, number> = { thermal: 0, voltage: 0, overload: 0, health: 0 };
  for (const d of drafts) severitySum[d.module] += d.severity;

  return drafts
    .filter((d) => d.severity > 1e-6)
    .map((d) => ({ ...d, points: (a.risk.contributions[d.module] * d.severity) / severitySum[d.module] }))
    .sort((x, y) => y.points - x.points);
}
