// Headless simulator: runs the fleet with no UI and prints telemetry.
//
//   npm run sim -- --seed 42 --n 8 --minutes 30 --scenario internalShort
//   npm run sim -- --n 6 --minutes 5 --raw              (vendor payloads as sent)
//   npm run sim -- --n 3 --minutes 5 --ndjson           (canonical Telemetry, one JSON per line)
//   npm run sim -- --check-determinism                  (two runs, compare hashes)
//   npm run sim -- --bench --n 2000                     (throughput; add --ai to include the AI engine)
//   npm run sim -- --ai --explain --n 24 --minutes 40 --scenario overheatLoad+escalatingShort --battery A-0001
//
// The table shows what the AI would see: every vendor frame goes through the
// adapter, and the table prints the latest canonical Telemetry per battery.
// `--truth` adds simulator-only ground truth columns for debugging.
// `--ai` runs the AI engine and adds its Risk Score, level, estimated unexplained
// heat, time-to-limit and SOH; `--explain` prints the reasons behind each alert.
import { normalize, type Telemetry } from '../src/adapters';
import { createEngine, explainAssessment, ingest, type Assessment } from '../src/ai';
import { RISK_RANK } from '../src/lib/riskLevels';
import {
  BRAND_SPECS,
  SCENARIO_IDS,
  SIM,
  createFleet,
  hashString,
  stepFleet,
  truthOf,
  type FleetOptions,
  type FleetState,
  type ScenarioId,
} from '../src/sim';

interface Args {
  seed: number;
  n: number;
  minutes: number;
  scenario: ScenarioId[];
  overrides: Record<string, ScenarioId[]>;
  every: number;
  city: 'hcmc' | 'hanoi' | 'both';
  batteries: string[];
  raw: boolean;
  ndjson: boolean;
  truth: boolean;
  ai: boolean;
  explain: boolean;
  checkDeterminism: boolean;
  bench: boolean;
}

/** "agedHigh+heavyClimb" -> ['agedHigh', 'heavyClimb'] (validated). */
function parseScenarios(text: string): ScenarioId[] {
  const ids = text.split('+');
  for (const id of ids) {
    if (!(SCENARIO_IDS as readonly string[]).includes(id)) {
      throw new Error(`unknown scenario "${id}". One of: ${SCENARIO_IDS.join(', ')} (combine with "+")`);
    }
  }
  return ids as ScenarioId[];
}

function parseArgs(argv: string[]): Args {
  const a: Args = {
    seed: 42,
    n: 6,
    minutes: 10,
    scenario: ['baseline'],
    overrides: {},
    every: 12,
    city: 'hcmc',
    batteries: [],
    raw: false,
    ndjson: false,
    truth: false,
    ai: false,
    explain: false,
    checkDeterminism: false,
    bench: false,
  };
  const need = (i: number, flag: string): string => {
    const v = argv[i + 1];
    if (v === undefined) throw new Error(`${flag} needs a value`);
    return v;
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    switch (flag) {
      case '--seed': a.seed = Number(need(i++, flag)); break;
      case '--n': a.n = Number(need(i++, flag)); break;
      case '--minutes': a.minutes = Number(need(i++, flag)); break;
      case '--every': a.every = Number(need(i++, flag)); break;
      case '--city': a.city = need(i++, flag) as Args['city']; break;
      case '--battery': a.batteries.push(need(i++, flag)); break;
      case '--scenario':
        a.scenario = parseScenarios(need(i++, flag));
        break;
      case '--override': {
        const [id, s] = need(i++, flag).split('=');
        if (!id || !s) throw new Error('--override needs <batteryId>=<scenario>[+<scenario>...]');
        a.overrides[id] = parseScenarios(s);
        break;
      }
      case '--raw': a.raw = true; break;
      case '--ndjson': a.ndjson = true; break;
      case '--truth': a.truth = true; break;
      case '--ai': a.ai = true; break;
      case '--explain': a.ai = true; a.explain = true; break;
      case '--check-determinism': a.checkDeterminism = true; break;
      case '--bench': a.bench = true; break;
      case '--help': case '-h':
        console.log('See the header of scripts/headless.ts for usage.');
        process.exit(0);
      default:
        throw new Error(`unknown argument "${flag}"`);
    }
  }
  return a;
}

const fleetOptions = (a: Args): FleetOptions => ({
  seed: a.seed,
  n: a.n,
  city: a.city,
  scenario: a.scenario,
  overrides: a.overrides,
});

const hms = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};

const f = (x: number, w: number, d: number) => x.toFixed(d).padStart(w);

function row(fleet: FleetState, t: Telemetry, truth: boolean, ai: Assessment | undefined): string {
  const vPack = t.cellVoltages.reduce((s, v) => s + v, 0);
  const spreadMv = (Math.max(...t.cellVoltages) - Math.min(...t.cellVoltages)) * 1000;
  const b = fleet.batteries[Number.parseInt(t.batteryId.slice(2), 10) - 1];
  let line =
    `${hms((t.ts - SIM.epochMs) / 1000)}  ${t.batteryId}  ` +
    `${f(vPack, 6, 2)} V  ${f(t.current, 6, 1)} A  core ${f(t.coreTemp, 5, 1)}C  amb ${f(t.ambientTemp, 5, 1)}C  ` +
    `SOC ${f(t.soc * 100, 5, 1)}%  dV ${f(spreadMv, 5, 0)} mV  cyc ${String(t.cycleCount).padStart(4)}`;
  if (ai) {
    const eta = ai.thermal.etaToLimitS === null ? '   -' : f(ai.thermal.etaToLimitS / 60, 4, 0);
    line +=
      `  | AI ${f(ai.risk.score, 3, 0)} ${ai.risk.level.padEnd(7)}${ai.learning ? '(learning)' : '          '} ` +
      `q ${f(ai.thermal.unexplainedHeatW, 5, 1)}W  ETA ${eta}min  SOH^ ${f(ai.impedance.sohEst * 100, 4, 0)}%`;
  }
  if (truth && b) {
    const tr = truthOf(b);
    line += `  | ${tr.mode.padEnd(8)} SOH ${f(tr.soh * 100, 5, 1)}%  Qf ${f(tr.qFaultW, 5, 1)}W${tr.bmsTripped ? '  BMS-TRIP' : ''}`;
  }
  return line;
}

function printExplanation(a: Assessment): void {
  const sig = (e: ReturnType<typeof explainAssessment>[number]) => {
    const value = Number.isFinite(e.value) ? e.value.toFixed(1) : 'inf';
    const cell = e.cell === undefined ? '' : ` cell#${e.cell}`;
    return `    ${e.signal.padEnd(19)} ${value.padStart(7)} ${e.unit.padEnd(5)} (starts at ${e.threshold}, full at ${e.limit}) -> ${e.points.toFixed(1).padStart(5)} pts, confidence ${e.confidence.toFixed(2)}${cell}`;
  };
  console.log(`  ${a.batteryId}: Risk Score ${a.risk.score.toFixed(0)} (${a.risk.level}); actions: ${a.actions.map((x) => (x.value === undefined ? x.code : `${x.code} ${x.value.toFixed(2)}`)).join(', ')}`);
  for (const e of explainAssessment(a)) console.log(sig(e));
}

function runTable(a: Args): void {
  const fleet = createFleet(fleetOptions(a));
  const engine = a.ai ? createEngine() : null;
  const ticks = Math.round((a.minutes * 60) / SIM.tickS);
  const latest = new Map<string, Telemetry>();
  const assessed = new Map<string, Assessment>();
  const wanted = a.batteries.length > 0 ? new Set(a.batteries) : null;
  let rejected = 0;

  console.log(
    `# seed=${a.seed} n=${a.n} scenario=${a.scenario.join('+')} city=${a.city} tick=${SIM.tickS}s duration=${a.minutes}min  ` +
      `(brand cadence A/B/C = ${Object.values(BRAND_SPECS).map((s) => s.emitEveryTicks * SIM.tickS).join('/')} s)`,
  );

  for (let k = 0; k < ticks; k++) {
    const step = stepFleet(fleet);
    for (const frame of step.frames) {
      if (!engine && wanted && !wanted.has(frame.batteryId)) continue;
      if (a.raw) {
        if (!wanted || wanted.has(frame.batteryId)) console.log(JSON.stringify(frame.payload));
        continue;
      }
      const res = normalize(frame.payload);
      if (!res.ok) {
        rejected++;
        console.log(`# rejected ${frame.batteryId}: ${res.error.code}: ${res.error.message}`);
        continue;
      }
      if (engine) assessed.set(frame.batteryId, ingest(engine, res.value));
      if (wanted && !wanted.has(frame.batteryId)) continue;
      latest.set(frame.batteryId, res.value);
      if (a.ndjson) console.log(JSON.stringify(res.value));
    }
    if (!a.raw && !a.ndjson && (step.tick % a.every === 0 || step.tick === 1)) {
      for (const t of [...latest.values()].sort((x, y) => x.batteryId.localeCompare(y.batteryId))) {
        console.log(row(fleet, t, a.truth, assessed.get(t.batteryId)));
      }
      console.log('');
    }
  }
  if (rejected > 0) console.log(`# ${rejected} frame(s) rejected by the adapter`);

  if (a.explain) {
    console.log('# reasons behind every battery at "watch" or above (final state):');
    const flagged = [...assessed.values()]
      .filter((x) => (!wanted || wanted.has(x.batteryId)) && RISK_RANK[x.risk.level] >= RISK_RANK.watch)
      .sort((x, y) => y.risk.score - x.risk.score);
    if (flagged.length === 0) console.log('  (none)');
    for (const x of flagged.slice(0, 8)) printExplanation(x);
  }
}

/** FNV hash over the full canonical telemetry stream (and AI scores) of a run. */
function streamHash(a: Args): { hash: number; frames: number } {
  const fleet = createFleet(fleetOptions(a));
  const engine = createEngine();
  const ticks = Math.round((a.minutes * 60) / SIM.tickS);
  let h = 0;
  let frames = 0;
  for (let k = 0; k < ticks; k++) {
    for (const frame of stepFleet(fleet).frames) {
      const res = normalize(frame.payload);
      const ai = res.ok ? ingest(engine, res.value) : null;
      h = hashString(`${h}|${JSON.stringify(res.ok ? res.value : res.error)}|${ai ? ai.risk.score.toFixed(9) : ''}`);
      frames++;
    }
  }
  return { hash: h, frames };
}

function checkDeterminism(a: Args): void {
  const first = streamHash(a);
  const second = streamHash(a);
  const other = streamHash({ ...a, seed: a.seed + 1 });
  const same = first.hash === second.hash;
  const differs = first.hash !== other.hash;
  console.log(`run 1 : hash ${first.hash.toString(16).padStart(8, '0')}  (${first.frames} frames)`);
  console.log(`run 2 : hash ${second.hash.toString(16).padStart(8, '0')}  (${second.frames} frames)`);
  console.log(`seed+1: hash ${other.hash.toString(16).padStart(8, '0')}  (${other.frames} frames)`);
  console.log(same && differs ? 'OK: same seed reproduces exactly (telemetry and AI scores), a different seed differs.' : 'FAIL: determinism check failed.');
  if (!(same && differs)) process.exit(1);
}

function bench(a: Args): void {
  const n = a.n === 6 ? 2000 : a.n;
  const fleet = createFleet({ ...fleetOptions(a), n });
  const ticks = Math.round((a.minutes * 60) / SIM.tickS);
  const num = (x: number) => Math.round(x).toLocaleString('en-US');

  const t0 = performance.now();
  const payloads: unknown[][] = [];
  for (let k = 0; k < ticks; k++) payloads.push(stepFleet(fleet).frames.map((fr) => fr.payload));
  const simMs = performance.now() - t0;
  const frames = payloads.reduce((s, p) => s + p.length, 0);
  const steps = n * ticks;
  console.log(`simulator: ${n} batteries x ${ticks} ticks (${a.minutes} sim-min) in ${simMs.toFixed(0)} ms: ${num(steps / (simMs / 1000))} battery-steps/s`);
  // At 60x speed the UI needs 60/5 = 12 ticks per wall-clock second.
  console.log(`           60x speed needs ${num(n * 12)} battery-steps/s: ${(steps / (simMs / 1000) / (n * 12)).toFixed(1)}x headroom (single thread, no UI).`);

  if (a.ai) {
    const engine = createEngine();
    const t1 = performance.now();
    for (const tick of payloads) {
      for (const p of tick) {
        const res = normalize(p);
        if (res.ok) ingest(engine, res.value);
      }
    }
    const aiMs = performance.now() - t1;
    const need60 = (frames / ticks) * 12;
    console.log(`AI engine: ${num(frames)} frames (adapter + 4 modules + Risk Score) in ${aiMs.toFixed(0)} ms: ${((aiMs * 1000) / frames).toFixed(1)} us/frame, ${num(frames / (aiMs / 1000))} frames/s`);
    console.log(`           60x speed needs ${num(need60)} frames/s: ${(frames / (aiMs / 1000) / need60).toFixed(1)}x headroom.`);
  }
}

const args = parseArgs(process.argv.slice(2));
if (args.checkDeterminism) checkDeterminism(args);
else if (args.bench) bench(args);
else runTable(args);
