// UI-side controller of the live fleet. One shared fleet runs for the whole app (the Fleet,
// Vital signs and Twin screens all look at it); it plays while at least one screen is
// watching and pauses when none is. Without Web Workers it falls back to the main thread.
import { DEFAULT_FLEET_CONFIG, type FleetConfig, type FleetLayout, type FleetSnapshot } from '../fleet';
import { FleetRunner, type FleetRequest, type FleetResponse, type FleetSpeed } from '../fleet/runner';

export interface FleetViewState {
  config: FleetConfig;
  layout: FleetLayout | null;
  snapshot: FleetSnapshot | null;
  /** What the user asked for; the fleet only actually plays while a screen is watching. */
  playing: boolean;
  speed: FleetSpeed;
  /** Simulated seconds per real second actually achieved. */
  effectiveSpeed: number;
  selectedId: string | null;
  error: string | null;
}

type Listener = () => void;

class FleetController {
  private state: FleetViewState = {
    config: DEFAULT_FLEET_CONFIG,
    layout: null,
    snapshot: null,
    playing: true,
    speed: 60,
    effectiveSpeed: 0,
    selectedId: null,
    error: null,
  };
  private readonly listeners = new Set<Listener>();
  private worker: Worker | null = null;
  private runner: FleetRunner | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private started = false;

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    this.ensureStarted();
    this.syncRunning();
    return () => {
      this.listeners.delete(listener);
      this.syncRunning();
    };
  };

  readonly getState = (): FleetViewState => this.state;

  private set(patch: Partial<FleetViewState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  private send(req: FleetRequest): void {
    if (this.worker) this.worker.postMessage(req);
    else this.runner?.handle(req);
  }

  private receive = (msg: FleetResponse): void => {
    if (msg.kind === 'ready') {
      this.set({ config: msg.config, layout: msg.layout, snapshot: null, error: null });
    } else if (msg.kind === 'snapshot') {
      this.set({ snapshot: msg.snapshot, speed: msg.speed, effectiveSpeed: msg.effectiveSpeed });
    } else {
      this.set({ error: msg.message });
    }
  };

  private ensureStarted(): void {
    if (this.started) return;
    this.started = true;
    if (typeof Worker !== 'undefined') {
      try {
        this.worker = new Worker(new URL('./fleet.worker.ts', import.meta.url), { type: 'module' });
        this.worker.onmessage = (e: MessageEvent<FleetResponse>) => this.receive(e.data);
        this.worker.onerror = () => this.useMainThread();
      } catch {
        this.useMainThread();
      }
    } else this.useMainThread();
    this.send({ kind: 'configure', config: this.state.config });
    this.send({ kind: 'speed', speed: this.state.speed });
  }

  private useMainThread(): void {
    this.worker?.terminate();
    this.worker = null;
    this.runner = new FleetRunner((msg) => this.receive(msg), () => performance.now());
    this.timer = setInterval(() => this.runner?.pump(), 30);
    this.send({ kind: 'configure', config: this.state.config });
    this.send({ kind: 'speed', speed: this.state.speed });
    if (this.state.selectedId) this.send({ kind: 'select', id: this.state.selectedId });
    this.syncRunning();
  }

  /** Play only while someone is watching and the user has not paused. */
  private syncRunning(): void {
    if (!this.started) return;
    const watching = this.listeners.size > 0;
    this.send({ kind: watching && this.state.playing ? 'play' : 'pause' });
  }

  configure(config: FleetConfig): void {
    this.ensureStarted();
    this.set({ config, selectedId: null, snapshot: null });
    this.send({ kind: 'configure', config });
    this.syncRunning();
  }

  play(): void {
    this.set({ playing: true });
    this.syncRunning();
  }

  pause(): void {
    this.set({ playing: false });
    this.syncRunning();
  }

  setSpeed(speed: FleetSpeed): void {
    this.set({ speed });
    this.send({ kind: 'speed', speed });
  }

  select(id: string | null): void {
    this.set({ selectedId: id });
    this.send({ kind: 'select', id });
  }

  /** Start over with the same configuration (same seed, so the same story). */
  reset(): void {
    this.configure(this.state.config);
  }

  dispose(): void {
    this.worker?.terminate();
    if (this.timer) clearInterval(this.timer);
  }
}

export const fleetController = new FleetController();
