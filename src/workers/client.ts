// UI-side access to the simulation worker: a promise API with a result cache (runs
// are deterministic, so the same spec always gives the same result) and a
// main-thread fallback when workers are unavailable.
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

function send(req: Omit<SimRequest, 'id'>): Promise<SimResponse> {
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

function memo<T>(key: string, compute: () => Promise<T>): Promise<T> {
  let hit = cache.get(key) as Promise<T> | undefined;
  if (!hit) {
    hit = compute();
    cache.set(key, hit);
    hit.catch(() => cache.delete(key));
  }
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
