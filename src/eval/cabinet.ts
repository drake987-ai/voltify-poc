// Fast-charging a hot pack in a swap cabinet, with and without the platform reducing the
// charging current: the same pack, seed and cabinet, run twice. Compares peak and mean
// temperature, time to a full charge, and the projected pack lifetime.
import type { Brand } from '../adapters';
import { defaultValues, type AssumptionValues } from '../business/assumptions';
import { fadePerEfc, projectMixedLifetime, type MixedLifetime } from '../sim';
import { runTimeline, type Timeline } from './timeline';

export interface ChargeSummary {
  /** Seconds the pack spent in charging mode (the charge window shown on screen). */
  chargingS: number;
  /** First time the pack reached 98 % reported SOC; null if it never did within the run. */
  fullS: number | null;
  peakTempC: number;
  meanTempC: number;
  /** Capacity fade per equivalent full cycle, averaged over the charge weighted by current. */
  meanFadePerEfc: number;
  /** Lowest charging-current multiplier the cabinet was told to use. */
  minScale: number;
}

/** Frames of the contiguous charging window from the start of the run. */
export function chargeFrames(t: Timeline): Timeline['frames'] {
  const out: Timeline['frames'] = [];
  for (const f of t.frames) {
    if (f.truth.mode !== 'charging') break;
    out.push(f);
  }
  return out;
}

export function summarizeCharge(t: Timeline): ChargeSummary {
  const frames = chargeFrames(t);
  let peak = -Infinity;
  let sumT = 0;
  let sumFade = 0;
  let sumI = 0;
  let minScale = 1;
  for (const f of frames) {
    peak = Math.max(peak, f.truth.coreTempC);
    sumT += f.truth.coreTempC;
    const i = Math.abs(f.telemetry.current);
    sumFade += i * fadePerEfc(f.truth.coreTempC);
    sumI += i;
    minScale = Math.min(minScale, f.truth.chargeScale);
  }
  const full = t.frames.find((f) => f.telemetry.soc >= 0.98);
  return {
    chargingS: frames.length > 0 ? frames[frames.length - 1].tS - frames[0].tS : 0,
    fullS: full ? full.tS : null,
    peakTempC: peak,
    meanTempC: frames.length > 0 ? sumT / frames.length : Number.NaN,
    meanFadePerEfc: sumI > 0 ? sumFade / sumI : Number.NaN,
    minScale,
  };
}

export interface CabinetAB {
  without: Timeline;
  with: Timeline;
  summaryWithout: ChargeSummary;
  summaryWith: ChargeSummary;
  lifetimeWithout: MixedLifetime;
  lifetimeWith: MixedLifetime;
  /** Longer life with the intervention, as a percentage (projection from the ageing model). */
  lifetimeGainPct: number;
  assumptions: AssumptionValues;
}

export interface CabinetSpec {
  seed: number;
  brand: Brand;
  durationS: number;
  assumptions?: AssumptionValues;
}

export function runCabinetAB(spec: CabinetSpec): CabinetAB {
  const base = { scenario: 'hotCabinet' as const, seed: spec.seed, brand: spec.brand, durationS: spec.durationS };
  const without = runTimeline({ ...base, mode: 'bms' });
  const withCut = runTimeline({ ...base, mode: 'cabinet' });
  const summaryWithout = summarizeCharge(without);
  const summaryWith = summarizeCharge(withCut);
  const a = spec.assumptions ?? defaultValues();
  const life = (s: ChargeSummary) =>
    projectMixedLifetime({
      chargeFadePerEfc: s.meanFadePerEfc,
      rideTempC: a.rideTempC,
      chargeShare: a.chargeShare,
      efcPerDay: a.efcPerDay,
    });
  const lifetimeWithout = life(summaryWithout);
  const lifetimeWith = life(summaryWith);
  return {
    without,
    with: withCut,
    summaryWithout,
    summaryWith,
    lifetimeWithout,
    lifetimeWith,
    lifetimeGainPct: (lifetimeWith.efcToEol / lifetimeWithout.efcToEol - 1) * 100,
    assumptions: a,
  };
}
