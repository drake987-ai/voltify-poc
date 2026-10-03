// Drives a live fleet in (wall-clock) time: advances the simulation at the chosen speed
// and publishes snapshots about ten times a second. It knows nothing about workers: it
// takes a `post` function and a clock, so it runs in a Web Worker, on the main thread as
// a fallback, and in tests with a fake clock.
import { advanceLive, createLiveFleet, layoutOf, snapshotOf, type FleetLayout, type FleetSnapshot, type LiveFleet } from './liveFleet';
import type { FleetConfig } from './plan';

export const FLEET_SPEEDS = [1, 10, 60] as const;
export type FleetSpeed = (typeof FLEET_SPEEDS)[number];

export type FleetRequest =
  | { kind: 'configure'; config: FleetConfig }
  | { kind: 'play' }
  | { kind: 'pause' }
  | { kind: 'speed'; speed: FleetSpeed }
  | { kind: 'select'; id: string | null };

export type FleetResponse =
  | { kind: 'ready'; config: FleetConfig; layout: FleetLayout; playing: boolean; speed: FleetSpeed }
  | { kind: 'snapshot'; snapshot: FleetSnapshot; playing: boolean; speed: FleetSpeed; effectiveSpeed: number }
  | { kind: 'error'; message: string };

const TICK_S = 5;
/** Longest single pump, so a slow machine degrades the speed instead of freezing the thread (ms). */
const PUMP_BUDGET_MS = 40;
const SNAPSHOT_EVERY_MS = 100;
/** Never try to catch up more than this much simulated time after a stall (s). */
const MAX_BACKLOG_S = 60;

export class FleetRunner {
  private live: LiveFleet | null = null;
  private config: FleetConfig | null = null;
  private playing = false;
  private speed: FleetSpeed = 60;
  private selected: string | null = null;
  private lastWall = 0;
  private lastPost = -Infinity;
  private backlogS = 0;
  private simAtLastPost = 0;
  private wallAtLastPost = 0;
  private effectiveSpeed = 0;

  constructor(
    private readonly post: (msg: FleetResponse, transfer?: Transferable[]) => void,
    private readonly clock: () => number,
  ) {}

  handle(req: FleetRequest): void {
    try {
      switch (req.kind) {
        case 'configure':
          this.config = req.config;
          this.live = createLiveFleet(req.config);
          this.playing = false;
          this.backlogS = 0;
          this.selected = null;
          this.post({ kind: 'ready', config: req.config, layout: layoutOf(this.live), playing: false, speed: this.speed });
          this.publish(true);
          break;
        case 'play':
          this.playing = true;
          this.lastWall = this.clock();
          break;
        case 'pause':
          this.playing = false;
          this.publish(true);
          break;
        case 'speed':
          this.speed = req.speed;
          break;
        case 'select':
          this.selected = req.id;
          this.publish(true);
          break;
      }
    } catch (e) {
      this.post({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }

  /** Call every few tens of milliseconds. */
  pump(): void {
    const live = this.live;
    if (!live) return;
    const now = this.clock();
    try {
      if (this.playing) {
        const dtWall = Math.min(now - this.lastWall, 250) / 1000;
        this.backlogS = Math.min(this.backlogS + dtWall * this.speed, MAX_BACKLOG_S);
        const start = this.clock();
        // At least one tick per pump (so a slow machine runs slower instead of freezing), then
        // as many as fit in the time budget.
        while (this.backlogS >= TICK_S) {
          advanceLive(live, 1);
          this.backlogS -= TICK_S;
          if (this.clock() - start >= PUMP_BUDGET_MS) break;
        }
      }
      this.lastWall = now;
      this.publish(false);
    } catch (e) {
      this.playing = false;
      this.post({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }

  private publish(force: boolean): void {
    const live = this.live;
    if (!live) return;
    const now = this.clock();
    if (!force && now - this.lastPost < SNAPSHOT_EVERY_MS) return;
    const snapshot = snapshotOf(live, this.selected);
    if (now > this.wallAtLastPost && this.lastPost !== -Infinity && this.playing) {
      const measured = (snapshot.tS - this.simAtLastPost) / ((now - this.wallAtLastPost) / 1000);
      // Smooth it a little: ticks arrive in bursts.
      this.effectiveSpeed = this.effectiveSpeed === 0 ? measured : 0.7 * this.effectiveSpeed + 0.3 * measured;
    } else if (!this.playing) this.effectiveSpeed = 0;
    this.simAtLastPost = snapshot.tS;
    this.wallAtLastPost = now;
    this.lastPost = now;
    this.post(
      { kind: 'snapshot', snapshot, playing: this.playing, speed: this.speed, effectiveSpeed: this.effectiveSpeed },
      [
        snapshot.lat.buffer,
        snapshot.lng.buffer,
        snapshot.level.buffer,
        snapshot.score.buffer,
        snapshot.soc.buffer,
        snapshot.soh.buffer,
        snapshot.perf.buffer,
        snapshot.temp.buffer,
        snapshot.flags.buffer,
      ],
    );
  }

  /** Current configuration (for tests and the controller). */
  currentConfig(): FleetConfig | null {
    return this.config;
  }
}
