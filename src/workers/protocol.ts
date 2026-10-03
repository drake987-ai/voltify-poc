// Messages between the UI thread and the simulation worker, plus the pure handler
// the worker runs. The handler is separate from the worker wrapper so it can be
// tested (and used as a fallback) without a Worker.
import { measurePrevention, type PreventionMeasure } from '../fleet/prevention';
import { runCabinetAB, type CabinetAB, type CabinetSpec } from '../eval/cabinet';
import { runSuite, type SuiteResult, type SuiteSpec } from '../eval/evidence';
import { runHub, type HubRun, type HubSpec } from '../eval/hub';
import { runAB, runTimeline, type ABResult, type Timeline, type TimelineSpec } from '../eval/timeline';

export type SimRequest =
  | { id: number; kind: 'timeline'; spec: TimelineSpec }
  | { id: number; kind: 'ab'; spec: Omit<TimelineSpec, 'mode'> }
  | { id: number; kind: 'cabinet'; spec: CabinetSpec }
  | { id: number; kind: 'hub'; spec?: HubSpec }
  | { id: number; kind: 'prevention' }
  | { id: number; kind: 'evidence'; specs: SuiteSpec[] };

export type SimResponse =
  | { id: number; ok: true; kind: 'timeline'; result: Timeline }
  | { id: number; ok: true; kind: 'ab'; result: ABResult }
  | { id: number; ok: true; kind: 'cabinet'; result: CabinetAB }
  | { id: number; ok: true; kind: 'hub'; result: HubRun }
  | { id: number; ok: true; kind: 'prevention'; result: PreventionMeasure }
  | { id: number; ok: true; kind: 'evidence'; result: SuiteResult[] }
  | { id: number; ok: false; error: string };

/** Run a request to completion. Never throws: failures come back as an error response. */
export function handleRequest(req: SimRequest): SimResponse {
  try {
    if (req.kind === 'timeline') return { id: req.id, ok: true, kind: 'timeline', result: runTimeline(req.spec) };
    if (req.kind === 'ab') return { id: req.id, ok: true, kind: 'ab', result: runAB(req.spec) };
    if (req.kind === 'cabinet') return { id: req.id, ok: true, kind: 'cabinet', result: runCabinetAB(req.spec) };
    if (req.kind === 'hub') return { id: req.id, ok: true, kind: 'hub', result: runHub(req.spec) };
    if (req.kind === 'prevention') return { id: req.id, ok: true, kind: 'prevention', result: measurePrevention() };
    return { id: req.id, ok: true, kind: 'evidence', result: req.specs.map(runSuite) };
  } catch (e) {
    return { id: req.id, ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
