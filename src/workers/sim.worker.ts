/// <reference lib="webworker" />
// Web Worker entry: the simulator and the AI engine run here so the UI thread stays smooth.
import { handleRequest, type SimRequest } from './protocol';

self.onmessage = (event: MessageEvent<SimRequest>) => {
  self.postMessage(handleRequest(event.data));
};
