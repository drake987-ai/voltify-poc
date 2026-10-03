import { describe, expect, it } from 'vitest';
import { DEFAULT_FLEET_CONFIG } from '@/fleet';
import { FleetRunner, type FleetResponse } from '@/fleet/runner';

const CONFIG = { ...DEFAULT_FLEET_CONFIG, n: 60 };

/** A runner with a fake clock the test advances, collecting what it posts. */
function harness() {
  let now = 0;
  const out: FleetResponse[] = [];
  const runner = new FleetRunner((m) => out.push(m), () => now);
  const advance = (ms: number, step = 30) => {
    for (let t = 0; t < ms; t += step) {
      now += step;
      runner.pump();
    }
  };
  const snapshots = () => out.filter((m): m is Extract<FleetResponse, { kind: 'snapshot' }> => m.kind === 'snapshot');
  return { runner, advance, snapshots, out, tick: () => now };
}

describe('fleet runner', () => {
  it('announces the fleet layout once configured, and starts paused', () => {
    const h = harness();
    h.runner.handle({ kind: 'configure', config: CONFIG });
    const ready = h.out.find((m) => m.kind === 'ready');
    expect(ready).toBeDefined();
    if (ready?.kind === 'ready') {
      expect(ready.layout.n).toBe(60);
      expect(ready.playing).toBe(false);
    }
    h.advance(1000);
    expect(h.snapshots().every((s) => s.snapshot.tS === 0)).toBe(true); // nothing advances until play
  });

  it('advances simulated time at the chosen speed (60x: one tick every 83 ms of real time)', () => {
    const h = harness();
    h.runner.handle({ kind: 'configure', config: CONFIG });
    h.runner.handle({ kind: 'speed', speed: 60 });
    h.runner.handle({ kind: 'play' });
    h.advance(10_000);
    const last = h.snapshots().at(-1)!;
    expect(last.snapshot.tS).toBeGreaterThan(560);
    expect(last.snapshot.tS).toBeLessThanOrEqual(605); // 10 s x 60 = 600 simulated seconds
    expect(last.playing).toBe(true);
  });

  it.each([[1, 10], [10, 100]])('at %ix it advances about %i simulated seconds in 10 s', (speed, expected) => {
    const h = harness();
    h.runner.handle({ kind: 'configure', config: CONFIG });
    h.runner.handle({ kind: 'speed', speed: speed as 1 | 10 });
    h.runner.handle({ kind: 'play' });
    h.advance(10_000);
    expect(Math.abs(h.snapshots().at(-1)!.snapshot.tS - expected)).toBeLessThanOrEqual(5);
  });

  it('pauses and resumes without losing or jumping simulated time', () => {
    const h = harness();
    h.runner.handle({ kind: 'configure', config: CONFIG });
    h.runner.handle({ kind: 'play' });
    h.advance(3000);
    h.runner.handle({ kind: 'pause' });
    const paused = h.snapshots().at(-1)!.snapshot.tS;
    h.advance(5000);
    expect(h.snapshots().at(-1)!.snapshot.tS).toBe(paused);
    h.runner.handle({ kind: 'play' });
    h.advance(1000);
    expect(h.snapshots().at(-1)!.snapshot.tS).toBeGreaterThan(paused);
    expect(h.snapshots().at(-1)!.snapshot.tS - paused).toBeLessThan(120); // no catch-up for the time spent paused
  });

  it('publishes snapshots about ten times a second, not on every pump', () => {
    const h = harness();
    h.runner.handle({ kind: 'configure', config: CONFIG });
    h.runner.handle({ kind: 'play' });
    const before = h.snapshots().length;
    h.advance(2000, 10);
    const posted = h.snapshots().length - before;
    expect(posted).toBeGreaterThanOrEqual(15);
    expect(posted).toBeLessThanOrEqual(21);
  });

  it('includes the detail of the selected battery in the snapshots', () => {
    const h = harness();
    h.runner.handle({ kind: 'configure', config: CONFIG });
    h.runner.handle({ kind: 'play' });
    h.advance(2000);
    const id = (h.out.find((m) => m.kind === 'ready') as Extract<FleetResponse, { kind: 'ready' }>).layout.ids[3];
    h.runner.handle({ kind: 'select', id });
    expect(h.snapshots().at(-1)!.snapshot.selected?.id).toBe(id);
    h.runner.handle({ kind: 'select', id: null });
    expect(h.snapshots().at(-1)!.snapshot.selected).toBeNull();
  });

  it('starting over with the same configuration replays the same story', () => {
    const h = harness();
    h.runner.handle({ kind: 'configure', config: CONFIG });
    h.runner.handle({ kind: 'play' });
    h.advance(5000);
    const first = h.snapshots().at(-1)!.snapshot;
    h.runner.handle({ kind: 'configure', config: CONFIG });
    h.runner.handle({ kind: 'play' });
    h.advance(5000);
    const second = h.snapshots().at(-1)!.snapshot;
    expect(second.tS).toBe(first.tS);
    expect(Array.from(second.level)).toEqual(Array.from(first.level));
    expect(JSON.stringify(second.kpis)).toBe(JSON.stringify(first.kpis));
  });

  it('degrades speed rather than freezing when the work cannot keep up', () => {
    // A clock that jumps 100 ms on every read makes every tick "cost" more than the pump budget.
    let t = 0;
    const out: FleetResponse[] = [];
    const runner = new FleetRunner((m) => out.push(m), () => (t += 100));
    runner.handle({ kind: 'configure', config: CONFIG });
    runner.handle({ kind: 'play' });
    for (let i = 0; i < 20; i++) runner.pump();
    const last = out.filter((m) => m.kind === 'snapshot').at(-1);
    expect(last?.kind === 'snapshot' && last.snapshot.tS).toBeGreaterThan(0); // still progresses
  });
});
