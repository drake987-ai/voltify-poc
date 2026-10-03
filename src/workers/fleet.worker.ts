/// <reference lib="webworker" />
// Web Worker entry for the live fleet: the simulator, the AI engine and the intervention
// policy run here, and snapshots stream to the UI about ten times a second.
import { FleetRunner, type FleetRequest, type FleetResponse } from '../fleet/runner';

const runner = new FleetRunner(
  (msg: FleetResponse, transfer?: Transferable[]) => self.postMessage(msg, transfer ?? []),
  () => performance.now(),
);

self.onmessage = (event: MessageEvent<FleetRequest>) => runner.handle(event.data);
setInterval(() => runner.pump(), 30);
