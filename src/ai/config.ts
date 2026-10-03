// Every threshold, time constant and weight of the AI engine in one place, so the
// "formulas and assumptions" panel and the tests read the same numbers the code
// runs on. All are ASSUMPTIONS tuned on simulated data (see docs/ in a later stage);
// the Evidence screen reports performance on seeds that were not used for tuning.

export const AI_CONFIG = {
  /** Seconds of data before the engine will raise anything (it is still learning the pack). */
  warmupS: 180,
  /** Seconds until the learning-confidence factor reaches 1. */
  fullConfidenceS: 900,
  /** A silence longer than this resets a battery's estimators (device was offline). */
  gapResetS: 900,

  thermal: {
    /** Kalman filter process noise: model error in T (K per sqrt(s)) and drift of the hidden heat (W per sqrt(s)). */
    procTempSigma: 0.003,
    procHeatSigma: 0.08,
    /**
     * Adaptive process noise: the heat's process noise is multiplied by the smoothed
     * normalised innovation squared (time constant `nisTauS`) divided by `nisTarget`,
     * between 1 and `maxNoiseBoost`.
     */
    nisTauS: 90,
    nisTarget: 1.5,
    maxNoiseBoost: 60,
    /** Prior 1-sigma of the unexplained heat at start (W). */
    heatPriorSigmaW: 5,
    heatMinW: -30,
    heatMaxW: 400,
    /** Smoothing of the ambient reading and of the Joule-heat estimate used in forecasts (s). */
    ambientTauS: 60,
    joulePowerTauS: 300,
    /** Time constant (s) of the fit that measures how fast the unexplained heat is growing. */
    heatRateTauS: 300,
    /** Forecast bounds: heat is not assumed to grow faster than this (1/s, relative) or beyond this many W. */
    maxGrowthPerS: 1 / 200,
    heatCapW: 150,
    /** The heat must have been above its warning level this long (s) before growth is assumed. */
    growthMinPersistS: 60,
    /** Slow pull of the "nominal twin" temperature toward the measured one while all is normal (s). */
    twinAnchorTauS: 1800,
    /** Unexplained heat (W) at which severity starts and at which it saturates. */
    warnW: 8,
    dangerW: 35,
    hysteresisW: 2,
    /** The excess must persist this long (s) before it counts in full. */
    persistS: 120,
    /** Time-to-limit severity, as (minutes, severity) points; beyond the last point severity is 0. */
    etaPointsMin: [
      [0, 1],
      [10, 0.95],
      [20, 0.8],
      [30, 0.65],
      [45, 0.45],
      [60, 0.3],
      [90, 0],
    ],
    /** Core temperature (degC) where absolute-temperature severity starts and reaches 1. */
    tempWarnC: 52,
  },

  voltage: {
    /** Time constants (s) of the fast and slow per-cell deviation averages. */
    fastTauS: 150,
    slowTauS: 1500,
    /**
     * Floors for the robust group spread (mV, at mid-charge) so a very quiet pack does
     * not make tiny offsets look huge. They scale with the OCV slope like everything else.
     */
    sigmaFloorMv: 2,
    driftSigmaFloorMv: 1.2,
    /**
     * Deviation is judged as the equivalent charge imbalance (% SOC): voltage divided
     * by the OCV slope at the present SOC, so the same imbalance counts the same near
     * empty and full as at mid-charge. Severity starts / saturates at these values;
     * about 15 / 120 mV at mid-charge for sag, and 5 / 50 mV for drift.
     */
    sagWarnPct: 2,
    sagDangerPct: 16,
    driftWarnPct: 0.7,
    driftDangerPct: 6.7,
    /** Reference mid-charge OCV slope (V per unit SOC) the floors above are defined at. */
    referenceSlope: 0.75,
    /** Robust z-score at which the outlier gate is fully open (it ramps in from 2). */
    zFull: 4,
    persistS: 90,
    /** Absolute cell-voltage limits (V). */
    minCellV: 2.8,
    maxCellV: 4.3,
    /**
     * Per-cell fit of deviation against current, dev = a + b*I (b in mV per 10 A), by
     * recursive least squares. The current-dependent part is removed before judging a
     * cell, so a healthy pack under heavy load is not mistaken for a sagging cell.
     */
    rlsForgetting: 0.998,
    rlsPriorSigmaMv: 20,
    /** Frames needed before the per-cell fit is trusted (half) and fully trusted. */
    minSamples: 30,
    fullSamples: 60,
    /**
     * A weak cell (resistance above its neighbours) is a maintenance finding, not a
     * fire signal: its excess resistance (mOhm over the group median) counts from
     * `weakWarnMOhm` to full at `weakFullMOhm`, and its severity is capped.
     */
    weakWarnMOhm: 0.8,
    weakFullMOhm: 3,
    weakResistanceFloorMOhm: 0.15,
    weakSeverityCap: 0.5,
  },

  overload: {
    rmsTauS: 120,
    /** Load ratio (RMS current / allowed continuous current): counts only once it exceeds the curve. */
    warnRatio: 1.0,
    dangerRatio: 1.6,
    /** Recommended derate aims for this ratio. */
    targetRatio: 0.9,
    maxDerate: 0.3,
    /** Charging while the pack is hotter than this (degC) is flagged. */
    hotChargeC: 45,
    hotChargeFullC: 55,
    /**
     * Allowed continuous current in C (of rated capacity) vs core temperature, as
     * (degC, C) points. Representative NMC derating, not any vendor's datasheet.
     */
    dischargeLimitC: [
      [-20, 0.3],
      [0, 1.0],
      [10, 1.5],
      [35, 2.0],
      [45, 1.5],
      [55, 0.8],
      [60, 0.4],
      [65, 0],
    ],
    chargeLimitC: [
      [0, 0.1],
      [10, 0.3],
      [15, 0.5],
      [40, 0.5],
      [45, 0.3],
      [50, 0.15],
      [55, 0],
    ],
  },

  impedance: {
    /** RLS forgetting factor per informative update. */
    forgetting: 0.9985,
    /** Only |dI| above this (A) between two samples carries information about R. */
    minDeltaA: 2,
    /** Pairs further apart than this (s) are not used. */
    maxDtS: 40,
    /** Prior: a 90 % SOH pack, with a wide uncertainty. */
    priorSoh: 0.9,
    priorSigma: 0.5,
    /** Updates needed for full confidence. */
    fullConfidenceUpdates: 60,
    /** SOH class boundaries (fraction). */
    goodSoh: 0.85,
    fairSoh: 0.75,
    /** Health severity runs from 0 at `healthOkSoh` to 1 at `healthBadSoh`. */
    healthOkSoh: 0.85,
    healthBadSoh: 0.6,
  },

  risk: {
    /**
     * Largest score each module can produce on its own (noisy-OR weight). Thermal
     * and voltage evidence can reach "danger" alone; overload and ageing are
     * aggravating factors that cannot reach "warning" without other evidence.
     */
    weights: { thermal: 0.9, voltage: 0.8, overload: 0.4, health: 0.3 },
    /** Score thresholds of the levels watch / warning / danger. */
    levelThresholds: [25, 50, 75],
    /** A level is left only once the score is this far below its entry threshold, for `dwellS`. */
    hysteresis: 5,
    dwellS: 60,
  },
} as const;
