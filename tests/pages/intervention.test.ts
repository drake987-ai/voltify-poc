import { describe, expect, it } from 'vitest';
import { runAB } from '@/eval/timeline';
import { runCabinetAB } from '@/eval/cabinet';
import { DEFAULT_POLICY, stationsFor } from '@/intervention';
import { abSpec } from '@/pages/ab/abConfig';
import { chargeSeriesOf, chargeStateAt, countTimesUpTo } from '@/pages/intervention/cabinetChart';
import { cabinetCommandLog, vehicleCommandLog } from '@/pages/intervention/commands';
import { phoneStateAt } from '@/pages/intervention/phoneState';
import { handleRequest } from '@/workers/protocol';

const ab = runAB(abSpec('severeHeatLoad', 'A', 'full'));
const tl = ab.voltify;
const events = Object.fromEntries(tl.events.map((e) => [e.kind, e]));

describe('the shipper phone follows the intervention events', () => {
  it('shows nothing to do before the notification, then walks through the stages in order', () => {
    const notified = events.shipper_notified.tS;
    const swap = events.swap_done.tS;
    expect(phoneStateAt(tl, notified - 1).stage).toBe('watching');
    expect(phoneStateAt(tl, notified).stage).toBe('notified');
    expect(phoneStateAt(tl, notified + DEFAULT_POLICY.shipperReactionS - 1).stage).toBe('notified');
    expect(phoneStateAt(tl, notified + DEFAULT_POLICY.shipperReactionS + 5).stage).toBe('riding');
    expect(phoneStateAt(tl, swap - 1).stage).toBe('swapping');
    expect(phoneStateAt(tl, swap).stage).toBe('done');

    const order = ['watching', 'notified', 'riding', 'swapping', 'done'];
    let last = 0;
    for (let tS = 0; tS <= swap + 60; tS += 5) {
      const i = order.indexOf(phoneStateAt(tl, tS).stage);
      expect(i).toBeGreaterThanOrEqual(last);
      last = i;
    }
  });

  it('sends the shipper to a real station at the distance the policy used, and brings them there as the swap starts', () => {
    const notified = events.shipper_notified;
    const s = phoneStateAt(tl, notified.tS);
    expect(s.station?.id).toBe(notified.stationId);
    expect(stationsFor(tl.city).some((x) => x.id === s.station?.id && x.coolPacks > 0)).toBe(true);
    expect(s.distanceM).toBeCloseTo(notified.distanceM!, 9);
    expect(s.remainingM).toBeCloseTo(notified.distanceM!, 9);

    // Arrival is when the ride (distance at the policy's speed) ends; the swap itself then takes the handling time.
    const arrive = notified.tS + DEFAULT_POLICY.shipperReactionS + notified.distanceM! / DEFAULT_POLICY.rideSpeedMs;
    expect(events.swap_done.tS).toBeCloseTo(arrive + DEFAULT_POLICY.swapHandlingS, 6);
    const at = phoneStateAt(tl, arrive + 1);
    expect(at.stage).toBe('swapping');
    expect(at.remainingM).toBe(0);
    expect(at.position!.lat).toBeCloseTo(s.station!.lat, 9);
    expect(at.position!.lng).toBeCloseTo(s.station!.lng, 9);
  });

  it('closes in on the station steadily while riding', () => {
    const n = events.shipper_notified;
    const from = n.tS + DEFAULT_POLICY.shipperReactionS;
    let last = Infinity;
    for (let tS = from; tS < from + n.distanceM! / DEFAULT_POLICY.rideSpeedMs; tS += 10) {
      const r = phoneStateAt(tl, tS).remainingM!;
      expect(r).toBeLessThanOrEqual(last);
      last = r;
    }
  });

  it('reports the power cut only once the shipper has been told', () => {
    expect(phoneStateAt(tl, 10).derate).toBe(0);
    expect(phoneStateAt(tl, events.shipper_notified.tS + 1).derate).toBe(DEFAULT_POLICY.derate);
  });
});

describe('command log', () => {
  const log = vehicleCommandLog(tl);

  it('has one message per event, in time order, on the right channel', () => {
    expect(log.map((e) => e.kind)).toEqual(['ai_alert', 'derate_sent', 'shipper_notified', 'swap_done']);
    expect(log.map((e) => e.channel)).toEqual(['platform', 'vehicle', 'app', 'station']);
    for (let i = 1; i < log.length; i++) expect(log[i].tS).toBeGreaterThanOrEqual(log[i - 1].tS);
  });

  it('carries values that match the simulation, not typed-in ones', () => {
    const alert = log[0].payload;
    const frame = tl.frames.find((f) => f.tS >= events.ai_alert.tS)!;
    expect(alert.risk_score).toBe(Math.round(frame.assessment!.risk.score));
    expect(alert.battery_id).toBe(tl.batteryId);
    expect(log[1].payload.limit_pct).toBe(85);
    expect(log[2].payload.station_id).toBe(events.shipper_notified.stationId);
    expect(log[2].payload.distance_m).toBe(Math.round(events.shipper_notified.distanceM!));
  });

  it('is plain JSON data (it is printed on screen)', () => {
    for (const e of log) expect(JSON.parse(JSON.stringify(e.payload))).toEqual(e.payload);
  });
});

describe('cabinet screen data', () => {
  const cab = runCabinetAB({ seed: 202, brand: 'A', durationS: 18_000 });

  it('lists the commands the cabinet policy sent, within the window', () => {
    const log = cabinetCommandLog(cab.with);
    expect(log.length).toBe(cab.with.cabinetEvents.length);
    expect(log[0].kind).toBe('charge_reduced');
    expect(log[0].payload.cmd).toBe('SET_CHARGE_CURRENT_SCALE');
    expect(log[0].payload.scale).toBe(Math.round(cab.with.cabinetEvents[0].scale * 100) / 100);
    expect(cabinetCommandLog(cab.with, 100).every((e) => e.tS <= 100)).toBe(true);
    // The ordinary cabinet is never sent anything.
    expect(cabinetCommandLog(cab.without)).toEqual([]);
  });

  it('keeps the series to the charging window and reads the state at a moment', () => {
    const w = chargeSeriesOf(cab.with);
    const wo = chargeSeriesOf(cab.without);
    expect(w.tS[0]).toBeLessThanOrEqual(15); // the first frame arrives within one telemetry period
    expect(wo.tS.length).toBeLessThan(w.tS.length); // the full-rate charge ends much sooner
    const mid = chargeStateAt(w, 300)!;
    expect(mid.over).toBe(false);
    expect(mid.scale).toBeLessThan(1);
    expect(chargeStateAt(wo, 300)!.scale).toBe(1);
    expect(chargeStateAt(wo, 1e9)!.over).toBe(true);
  });

  it('counts frames up to a time like the other series helpers do', () => {
    expect(countTimesUpTo([0, 5, 10, 15], -1)).toBe(0);
    expect(countTimesUpTo([0, 5, 10, 15], 5)).toBe(2);
    expect(countTimesUpTo([0, 5, 10, 15], 99)).toBe(4);
  });

  it('is answered by the worker handler with exactly what a direct call returns, and survives a structured clone', () => {
    const spec = { seed: 202, brand: 'B' as const, durationS: 600 };
    const res = handleRequest({ id: 3, kind: 'cabinet', spec });
    expect(res.ok && res.kind === 'cabinet').toBe(true);
    if (res.ok && res.kind === 'cabinet') {
      expect(JSON.stringify(res.result)).toBe(JSON.stringify(runCabinetAB(spec)));
      expect(JSON.stringify(structuredClone(res))).toBe(JSON.stringify(res));
    }
  });
});
