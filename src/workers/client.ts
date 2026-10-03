// UI-side access to the simulation worker: a promise API with a result cache (runs
// are deterministic, so the same spec always gives the same result) and a
// main-thread fallback when workers are unavailable.
import type { CabinetAB, CabinetSpec } from '../eval/cabinet';
import type { SuiteResult } from '../eval/evidence';
import { evidenceSuites } from '../eval/suites';
import type { HubRun, HubSpec } from '../eval/hub';
import type { PreventionMeasure } from '../fleet/prevention';
import type { ABResult, Timeline, TimelineSpec } from '../eval/timeline';
import type { SimRequest, SimResponse } from './protocol';

type Resolver = { resolve: (r: SimResponse) => void };

let worker: Worker | null = null;
let workerFailed = false;
let nextId = 1;
const pending = new Map<number, Resolver>();
const cache = new Map<string, Promise<unknown>>();

function getWorker(): Worker | null {
  if (workerFailed || typeof Worker === 'undefined') return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<SimResponse>) => {
      pending.get(e.data.id)?.resolve(e.data);
      pending.delete(e.data.id);
    };
    worker.onerror = () => {
      // Fall back to the main thread for everything still waiting and for future calls.
      workerFailed = true;
      worker = null;
    };
    return worker;
  } catch {
    workerFailed = true;
    return null;
  }
}

/** `Omit` that keeps the variants of a union apart. */
type WithoutId<T> = T extends unknown ? Omit<T, 'id'> : never;

function send(req: WithoutId<SimRequest>): Promise<SimResponse> {
  const id = nextId++;
  const full = { ...req, id } as SimRequest;
  const w = getWorker();
  // Without a worker the simulation runs on the main thread. The engine is loaded only then,
  // so the normal bundle carries just the (much lighter) client.
  if (!w) return import('./protocol').then((m) => m.handleRequest(full));
  return new Promise((resolve) => {
    pending.set(id, { resolve });
    w.postMessage(full);
  });
}

/** How many results are kept. A page that lets the user vary its inputs (the Sandbox) would otherwise keep every run in memory. */
const CACHE_LIMIT = 24;

function memo<T>(key: string, compute: () => Promise<T>): Promise<T> {
  let hit = cache.get(key) as Promise<T> | undefined;
  if (hit) {
    // Most recently used goes to the back of the line.
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  hit = compute();
  cache.set(key, hit);
  hit.catch(() => cache.delete(key));
  while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
  return hit;
}

export function runTimelineAsync(spec: TimelineSpec): Promise<Timeline> {
  return memo(`timeline:${JSON.stringify(spec)}`, async () => {
    const res = await send({ kind: 'timeline', spec });
    if (!res.ok) throw new Error(res.error);
    if (res.kind !== 'timeline') throw new Error('unexpected response');
    return res.result;
  });
}

export function runABAsync(spec: Omit<TimelineSpec, 'mode'>): Promise<ABResult> {
  return memo(`ab:${JSON.stringify(spec)}`, async () => {
    const res = await send({ kind: 'ab', spec });
    if (!res.ok) throw new Error(res.error);
    if (res.kind !== 'ab') throw new Error('unexpected response');
    return res.result;
  });
}

export function runCabinetAsync(spec: CabinetSpec): Promise<CabinetAB> {
  return memo(`cabinet:${JSON.stringify(spec)}`, async () => {
    const res = await send({ kind: 'cabinet', spec });
    if (!res.ok) throw new Error(res.error);
    if (res.kind !== 'cabinet') throw new Error('unexpected response');
    return res.result;
  });
}

export function runHubAsync(spec?: HubSpec): Promise<HubRun> {
  return memo(`hub:${JSON.stringify(spec ?? null)}`, async () => {
    const res = await send({ kind: 'hub', spec });
    if (!res.ok) throw new Error(res.error);
    if (res.kind !== 'hub') throw new Error('unexpected response');
    return res.result;
  });
}

/** The prevention rate measured on the demo fleet (a few seconds of work, so it is asked for once and kept). */
export function measurePreventionAsync(): Promise<PreventionMeasure> {
  return memo('prevention', async () => {
    const res = await send({ kind: 'prevention' });
    if (!res.ok) throw new Error(res.error);
    if (res.kind !== 'prevention') throw new Error('unexpected response');
    return res.result;
  });
}

const EVIDENCE_CHUNK = 6;

type EvidenceProgress = (done: number, total: number) => void;
let evidenceRun: { promise: Promise<SuiteResult[]>; done: number; total: number; listeners: Set<EvidenceProgress> } | null = null;

/**
 * Run the whole evidence batch in the worker, a few suites per message so progress can be shown.
 * The batch runs once per page load; later calls get the same results (and, while it is running, its progress).
 */
export function runEvidenceAsync(onProgress?: EvidenceProgress): Promise<SuiteResult[]> {
  if (!evidenceRun) {
    const specs = evidenceSuites();
    const state = { promise: Promise.resolve([] as SuiteResult[]), done: 0, total: specs.length, listeners: new Set<EvidenceProgress>() };
    state.promise = (async () => {
      const out: SuiteResult[] = [];
      for (let i = 0; i < specs.length; i += EVIDENCE_CHUNK) {
        const res = await send({ kind: 'evidence', specs: specs.slice(i, i + EVIDENCE_CHUNK) });
        if (!res.ok) throw new Error(res.error);
        if (res.kind !== 'evidence') throw new Error('unexpected response');
        out.push(...res.result);
        state.done = out.length;
        for (const l of state.listeners) l(state.done, state.total);
      }
      return out;
    })();
    state.promise.catch(() => {
      evidenceRun = null;
    });
    evidenceRun = state;
  }
  if (onProgress) {
    evidenceRun.listeners.add(onProgress);
    onProgress(evidenceRun.done, evidenceRun.total);
    evidenceRun.promise.finally(() => evidenceRun?.listeners.delete(onProgress)).catch(() => undefined);
  }
  return evidenceRun.promise;
}
