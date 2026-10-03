// Messages between the UI thread and the simulation worker, plus the pure handler
// the worker runs. The handler is separate from the worker wrapper so it can be
// tested (and used as a fallback) without a Worker.
import { runAB, runTimeline, type ABResult, type Timeline, type TimelineSpec } from '../eval/timeline';

export type SimRequest =
  | { id: number; kind: 'timeline'; spec: TimelineSpec }
  | { id: number; kind: 'ab'; spec: Omit<TimelineSpec, 'mode'> };

export type SimResponse =
  | { id: number; ok: true; kind: 'timeline'; result: Timeline }
  | { id: number; ok: true; kind: 'ab'; result: ABResult }
  | { id: number; ok: false; error: string };

/** Run a request to completion. Never throws: failures come back as an error response. */
export function handleRequest(req: SimRequest): SimResponse {
  try {
    if (req.kind === 'timeline') return { id: req.id, ok: true, kind: 'timeline', result: runTimeline(req.spec) };
    return { id: req.id, ok: true, kind: 'ab', result: runAB(req.spec) };
  } catch (e) {
    return { id: req.id, ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
