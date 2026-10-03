// A pack of an Evidence run can be opened on the Digital Twin screen through a link such as
// `#/twin?case=<json>`. The text comes from the address bar, so it is checked field by field
// before it is allowed to become a simulation.
import type { Brand } from '../../adapters';
import type { EvidenceSample } from '../../eval/evidence';
import type { TimelineSpec } from '../../eval/timeline';
import { SCENARIO_IDS, type ScenarioId, type ScenarioSelection } from '../../sim';

/** What is needed to rebuild one pack of a fleet run: the fleet, the pack, and any injected short. */
export interface TwinCase {
  scenario: ScenarioSelection;
  seed: number;
  n: number;
  brand: Brand;
  batteryId: string;
  durationS: number;
  inject?: { atS: number; fault: { rShortOhm0: number; rShortMinOhm: number; tauS: number } };
}

export const TWIN_CASE_PARAM = 'case';

export const encodeTwinCase = (c: TwinCase): string => encodeURIComponent(JSON.stringify(c));

const isId = (x: unknown): x is ScenarioId => typeof x === 'string' && (SCENARIO_IDS as readonly string[]).includes(x);
const num = (x: unknown, lo: number, hi: number): x is number => typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi;

/** The case described by a `case` parameter, or null if it is missing or anything in it is not acceptable. */
export function parseTwinCase(text: string | null): TwinCase | null {
  if (!text) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;

  const scenario = isId(o.scenario) ? o.scenario : Array.isArray(o.scenario) && o.scenario.length > 0 && o.scenario.every(isId) ? (o.scenario as ScenarioId[]) : null;
  if (scenario === null) return null;
  if (!num(o.seed, 0, 1e9) || !Number.isInteger(o.seed)) return null;
  if (!num(o.n, 1, 2000) || !Number.isInteger(o.n)) return null;
  if (o.brand !== 'A' && o.brand !== 'B' && o.brand !== 'C') return null;
  if (typeof o.batteryId !== 'string' || !new RegExp(`^${o.brand}-\\d{4}$`).test(o.batteryId)) return null;
  if (!num(o.durationS, 60, 9000)) return null;

  let inject: TwinCase['inject'];
  if (o.inject !== undefined) {
    const i = o.inject as Record<string, unknown> | null;
    const f = i && typeof i === 'object' ? (i.fault as Record<string, unknown> | undefined) : undefined;
    if (!i || !f || !num(i.atS, 0, o.durationS) || !num(f.rShortOhm0, 0.01, 1000) || !num(f.rShortMinOhm, 0.01, 1000) || !num(f.tauS, 1, 36000)) return null;
    inject = { atS: i.atS, fault: { rShortOhm0: f.rShortOhm0, rShortMinOhm: f.rShortMinOhm, tauS: f.tauS } };
  }
  return {
    scenario,
    seed: o.seed,
    n: o.n,
    brand: o.brand,
    batteryId: o.batteryId,
    durationS: o.durationS,
    ...(inject ? { inject } : {}),
  };
}

/** The timeline that replays the case: the same fleet, the one pack, the AI watching with nothing acting. */
export function specOfCase(c: TwinCase): TimelineSpec {
  return {
    scenario: c.scenario,
    seed: c.seed,
    n: c.n,
    brand: c.brand,
    batteryId: c.batteryId,
    durationS: c.durationS,
    mode: 'observe',
    ...(c.inject ? { inject: c.inject } : {}),
  };
}

/** The Twin case of a pack of an Evidence run. */
export function caseOfSample(s: EvidenceSample): TwinCase {
  return {
    scenario: s.replay.scenario,
    seed: s.seed,
    n: s.n,
    brand: s.brand,
    batteryId: s.batteryId,
    durationS: s.replay.durationS,
    ...(s.replay.inject ? { inject: s.replay.inject } : {}),
  };
}
