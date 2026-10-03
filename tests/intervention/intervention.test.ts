import { describe, expect, it } from 'vitest';
import {
  DEFAULT_POLICY,
  createIntervention,
  distanceM,
  nearestStation,
  stationsFor,
  stepIntervention,
  type InterventionInput,
} from '@/intervention';
import { CITY_BOX, type City } from '@/sim';

const CITIES: City[] = ['hcmc', 'hanoi'];

describe('swap-station network', () => {
  it.each(CITIES)('is deterministic and lies inside the city box (%s)', (city) => {
    const a = stationsFor(city);
    const b = stationsFor(city);
    expect(a).toBe(b); // cached
    expect(a.length).toBeGreaterThan(40);
    const box = CITY_BOX[city];
    for (const s of a) {
      expect(s.lat).toBeGreaterThan(box.latMin - 0.01);
      expect(s.lat).toBeLessThan(box.latMax + 0.01);
      expect(s.lng).toBeGreaterThan(box.lngMin - 0.01);
      expect(s.lng).toBeLessThan(box.lngMax + 0.01);
      expect(s.coolPacks).toBeGreaterThanOrEqual(0);
    }
    expect(new Set(a.map((s) => s.id)).size).toBe(a.length);
    expect(a.some((s) => s.coolPacks === 0)).toBe(true); // some stations have nothing to give
  });

  it('measures distance in metres', () => {
    // 0.01 degree of latitude is about 1,113 m.
    expect(distanceM(10.77, 106.7, 10.78, 106.7)).toBeCloseTo(1113.2, 0);
    expect(distanceM(10.77, 106.7, 10.77, 106.7)).toBe(0);
  });

  it('keeps a station with a cool pack close: under 800 m typically and under 2 km in the worst corner', () => {
    for (const city of CITIES) {
      const box = CITY_BOX[city];
      const distances: number[] = [];
      for (let i = 0; i <= 12; i++) {
        for (let j = 0; j <= 12; j++) {
          const lat = box.latMin + ((box.latMax - box.latMin) * i) / 12;
          const lng = box.lngMin + ((box.lngMax - box.lngMin) * j) / 12;
          distances.push(nearestStation(city, lat, lng)!.distanceM);
        }
      }
      distances.sort((a, b) => a - b);
      expect(distances[Math.floor(distances.length / 2)], `${city} median`).toBeLessThan(800);
      expect(distances[distances.length - 1], `${city} worst`).toBeLessThan(2000);
    }
  });

  it('only offers stations that have a cool pack, and the closest such one', () => {
    const city: City = 'hcmc';
    const stations = stationsFor(city);
    const empty = stations.find((s) => s.coolPacks === 0)!;
    const nearest = nearestStation(city, empty.lat, empty.lng)!;
    expect(nearest.station.coolPacks).toBeGreaterThan(0);
    expect(nearest.station.id).not.toBe(empty.id);
    const brute = Math.min(...stations.filter((s) => s.coolPacks > 0).map((s) => distanceM(empty.lat, empty.lng, s.lat, s.lng)));
    expect(nearest.distanceM).toBeCloseTo(brute, 6);
    expect(nearestStation(city, empty.lat, empty.lng, 99)).toBeNull();
  });
});

describe('intervention policy', () => {
  const at = (tS: number, level: InterventionInput['level']): InterventionInput => ({
    tS,
    level,
    lat: 10.78,
    lng: 106.7,
    city: 'hcmc',
  });

  it('does nothing while the pack is safe or merely on watch', () => {
    const s = createIntervention();
    for (let t = 0; t < 600; t += 5) {
      const c = stepIntervention(s, at(t, t < 300 ? 'safe' : 'watch'));
      expect(c).toEqual({ derate: 0, chargeCurrentScale: 1, parked: false });
    }
    expect(s.events).toEqual([]);
  });

  it('cuts power after the command latency, notifies the shipper, then swaps after riding to the station', () => {
    const s = createIntervention();
    const timeline: { tS: number; derate: number; parked: boolean }[] = [];
    for (let t = 0; t < 1800; t += 5) {
      const c = stepIntervention(s, at(t, t >= 200 ? 'warning' : 'safe'));
      timeline.push({ tS: t, derate: c.derate, parked: c.parked === true });
    }
    const p = DEFAULT_POLICY;
    expect(s.alertAtS).toBe(200);
    expect(s.derateAtS).toBe(200 + p.commandLatencyS);
    const station = s.stationDistanceM!;
    expect(s.swapAtS).toBeCloseTo(210 + p.shipperReactionS + station / p.rideSpeedMs + p.swapHandlingS, 6);

    // Before the command arrives there is no derate; from then on 15 %; parked only from the swap.
    expect(timeline.find((x) => x.tS === 205)!.derate).toBe(0);
    expect(timeline.find((x) => x.tS === 210)!.derate).toBe(p.derate);
    expect(timeline.find((x) => x.tS === Math.floor(s.swapAtS! / 5) * 5 - 5)!.parked).toBe(false);
    expect(timeline[timeline.length - 1].parked).toBe(true);
    expect(timeline[timeline.length - 1].derate).toBe(p.derate); // the cut stays on

    const kinds = s.events.map((e) => e.kind);
    expect(kinds).toEqual(['ai_alert', 'derate_sent', 'shipper_notified', 'swap_done']);
    const notified = s.events.find((e) => e.kind === 'shipper_notified')!;
    expect(notified.stationId).toBe(s.stationId);
    expect(notified.distanceM).toBeCloseTo(station, 6);
    for (let i = 1; i < s.events.length; i++) expect(s.events[i].tS).toBeGreaterThanOrEqual(s.events[i - 1].tS);
  });

  it('plans once: a later alert or a drop back to safe changes nothing', () => {
    const s = createIntervention();
    stepIntervention(s, at(100, 'danger'));
    const swap = s.swapAtS;
    stepIntervention(s, at(130, 'safe'));
    stepIntervention(s, at(160, 'danger'));
    expect(s.alertAtS).toBe(100);
    expect(s.swapAtS).toBe(swap);
    expect(stepIntervention(s, at(170, 'safe')).derate).toBe(DEFAULT_POLICY.derate);
  });

  it('can be set to act at "watch" instead, and respects a different cut', () => {
    const s = createIntervention();
    const policy = { ...DEFAULT_POLICY, alertLevel: 'watch' as const, derate: 0.3 };
    stepIntervention(s, at(0, 'watch'), policy);
    expect(stepIntervention(s, at(20, 'watch'), policy).derate).toBe(0.3);
  });
});
