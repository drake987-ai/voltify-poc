// The Cross-brand Hub run: one pack of each of the three vendors lives through the same bad
// afternoon, each reporting in its own format. Every message is kept in three forms: the raw
// payload as the vendor's server sent it, the canonical telemetry the adapter made of it, and the
// AI's assessment of that. The simulator's own sensor reading is kept as well, only so the screen
// can state how much each format loses on the way (validation, never fed to the AI).
import { BRANDS, normalize, type Brand, type Telemetry } from '../adapters';
import { createEngine, ingest, type Assessment } from '../ai';
import { RISK_RANK } from '../lib/riskLevels';
import { SIM, createFleet, pickBrand, stepFleet, type ScenarioSelection } from '../sim';

export interface HubSpec {
  seed: number;
  durationS: number;
  scenario: ScenarioSelection;
}

/** Fixed demo run: the hero scenario of the BMS-vs-Voltify screen, so the three brands can be compared there too. */
export const HUB_SPEC: HubSpec = { seed: 202, durationS: 600, scenario: 'severeHeatLoad' };

export interface HubFrame {
  /** Simulated seconds since the start. */
  tS: number;
  /** The vendor payload exactly as sent. */
  raw: unknown;
  /** Size of the JSON text of the payload, bytes. */
  bytes: number;
  telemetry: Telemetry;
  /** The sensor reading before the vendor format squeezed it (validation only). */
  reading: Telemetry;
  assessment: Assessment;
}

export interface ErrorStat {
  mean: number;
  max: number;
}

/** What the vendor format lost between the sensor and the cloud, as differences of the adapter output from the reading. */
export interface HubFidelity {
  cellMv: ErrorStat;
  coreTempC: ErrorStat;
  currentA: ErrorStat;
  socPct: ErrorStat;
}

export interface HubStream {
  brand: Brand;
  batteryId: string;
  frames: HubFrame[];
  /** Payloads the adapter refused (the pipeline carries on regardless). */
  adapterErrors: number;
  /** Median time between messages, s. */
  intervalS: number;
  meanBytes: number;
  fidelity: HubFidelity;
  /** First time the AI reached the Warning level, s; null if it never did. */
  alertS: number | null;
}

export interface HubRun {
  spec: HubSpec;
  streams: Record<Brand, HubStream>;
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  return n === 0 ? Number.NaN : n % 2 === 1 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
};

const stat = (xs: number[]): ErrorStat => ({
  mean: xs.length === 0 ? Number.NaN : xs.reduce((a, b) => a + b, 0) / xs.length,
  max: xs.length === 0 ? Number.NaN : Math.max(...xs),
});

/** Serial of the first pack of `brand` in a fleet of this seed. */
function firstSerial(seed: number, brand: Brand): number {
  for (let i = 0; i < 1000; i++) if (pickBrand(seed, i) === brand) return i + 1;
  throw new Error(`no pack of brand ${brand} among the first 1000`);
}

export function runHub(spec: HubSpec = HUB_SPEC): HubRun {
  const serials = Object.fromEntries(BRANDS.map((b) => [b, firstSerial(spec.seed, b)])) as Record<Brand, number>;
  const ids = BRANDS.map((b) => `${b}-${String(serials[b]).padStart(4, '0')}`);
  const fleet = createFleet({
    seed: spec.seed,
    n: Math.max(...Object.values(serials)),
    scenario: spec.scenario,
    only: ids,
  });
  const engine = createEngine();
  const streams = Object.fromEntries(
    BRANDS.map((b, i) => [
      b,
      { brand: b, batteryId: ids[i], frames: [] as HubFrame[], adapterErrors: 0, intervalS: 0, meanBytes: 0, alertS: null as number | null },
    ]),
  ) as Record<Brand, Omit<HubStream, 'fidelity'>>;
  const errors: Record<Brand, { cell: number[]; temp: number[]; current: number[]; soc: number[] }> = {
    A: { cell: [], temp: [], current: [], soc: [] },
    B: { cell: [], temp: [], current: [], soc: [] },
    C: { cell: [], temp: [], current: [], soc: [] },
  };

  const ticks = Math.round(spec.durationS / SIM.tickS);
  for (let k = 0; k < ticks; k++) {
    for (const f of stepFleet(fleet).frames) {
      const stream = streams[f.brand];
      const parsed = normalize(f.payload);
      if (!parsed.ok) {
        stream.adapterErrors++;
        continue;
      }
      const t = parsed.value;
      const battery = fleet.batteries.find((b) => b.config.id === f.batteryId)!;
      const reading = { ...battery.reading, cellVoltages: [...battery.reading.cellVoltages] };
      const assessment = ingest(engine, t);
      const tS = (t.ts - SIM.epochMs) / 1000;
      stream.frames.push({ tS, raw: f.payload, bytes: JSON.stringify(f.payload).length, telemetry: t, reading, assessment });
      if (stream.alertS === null && RISK_RANK[assessment.risk.level] >= RISK_RANK.warning) stream.alertS = tS;

      const e = errors[f.brand];
      for (let c = 0; c < t.cellVoltages.length; c++) e.cell.push(Math.abs(t.cellVoltages[c] - reading.cellVoltages[c]) * 1000);
      e.temp.push(Math.abs(t.coreTemp - reading.coreTemp));
      e.current.push(Math.abs(t.current - reading.current));
      e.soc.push(Math.abs(t.soc - reading.soc) * 100);
    }
  }

  const out = Object.fromEntries(
    BRANDS.map((b) => {
      const s = streams[b];
      const times = s.frames.map((fr) => fr.tS);
      const gaps = times.slice(1).map((x, i) => x - times[i]);
      const e = errors[b];
      const full: HubStream = {
        ...s,
        intervalS: median(gaps),
        meanBytes: s.frames.length === 0 ? 0 : s.frames.reduce((a, fr) => a + fr.bytes, 0) / s.frames.length,
        fidelity: { cellMv: stat(e.cell), coreTempC: stat(e.temp), currentA: stat(e.current), socPct: stat(e.soc) },
      };
      return [b, full];
    }),
  ) as Record<Brand, HubStream>;
  return { spec, streams: out };
}
