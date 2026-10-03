// Pseudo-routes: a random walk of waypoints inside a city box, travelled back and
// forth. Not real roads; just a plausible moving point for the map and a distance
// coordinate for the grade profile.
import { clamp, nextNormal, nextU, type Rng } from './rng';
import { CITY_BOX, METRES_PER_DEG_LAT, ROUTE_LEGS, type City } from './params';

export interface Route {
  lat: number[];
  lng: number[];
  /** Cumulative distance along the route at each waypoint, m. */
  cumM: number[];
  totalM: number;
}

export function generateRoute(rng: Rng, city: City): Route {
  const box = CITY_BOX[city];
  let lat = box.latMin + (box.latMax - box.latMin) * nextU(rng);
  let lng = box.lngMin + (box.lngMax - box.lngMin) * nextU(rng);
  let heading = nextU(rng) * 2 * Math.PI;

  const lats = [lat];
  const lngs = [lng];
  const cum = [0];
  for (let leg = 0; leg < ROUTE_LEGS; leg++) {
    heading += 0.6 * nextNormal(rng);
    const lenM = 300 + 900 * nextU(rng);
    const mPerDegLng = METRES_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
    const nextLat = clamp(lat + (lenM * Math.cos(heading)) / METRES_PER_DEG_LAT, box.latMin, box.latMax);
    const nextLng = clamp(lng + (lenM * Math.sin(heading)) / mPerDegLng, box.lngMin, box.lngMax);
    if (nextLat === box.latMin || nextLat === box.latMax || nextLng === box.lngMin || nextLng === box.lngMax) {
      heading += Math.PI; // bounce off the edge of the city box
    }
    const dN = (nextLat - lat) * METRES_PER_DEG_LAT;
    const dE = (nextLng - lng) * mPerDegLng;
    lat = nextLat;
    lng = nextLng;
    lats.push(lat);
    lngs.push(lng);
    cum.push(cum[cum.length - 1] + Math.max(1, Math.hypot(dN, dE)));
  }
  return { lat: lats, lng: lngs, cumM: cum, totalM: cum[cum.length - 1] };
}

/** Position after travelling `distanceM`; the route is driven out and back (ping-pong). */
export function positionAt(route: Route, distanceM: number): { lat: number; lng: number } {
  const period = 2 * route.totalM;
  let d = distanceM % period;
  if (d > route.totalM) d = period - d;
  let i = 1;
  while (i < route.cumM.length - 1 && route.cumM[i] < d) i++;
  const span = route.cumM[i] - route.cumM[i - 1];
  const f = span > 0 ? (d - route.cumM[i - 1]) / span : 0;
  return {
    lat: route.lat[i - 1] + (route.lat[i] - route.lat[i - 1]) * f,
    lng: route.lng[i - 1] + (route.lng[i] - route.lng[i - 1]) * f,
  };
}

/** Distance between two consecutive climbs, m. */
const CLIMB_PERIOD_M = 3000;

/**
 * Road grade (rise/run) at distance `distanceM`: gentle rolling terrain from two
 * sinusoids (within +/- 3.5 %), plus an optional sustained climb occupying
 * `duty` of every 3 km (bridges, ramps).
 */
export function gradeAt(
  phases: readonly [number, number],
  distanceM: number,
  climb: { grade: number; duty: number },
): number {
  const rolling = 0.015 * Math.sin(distanceM / 420 + phases[0]) + 0.02 * Math.sin(distanceM / 160 + phases[1]);
  const inClimb = (distanceM % CLIMB_PERIOD_M) / CLIMB_PERIOD_M < climb.duty;
  return rolling + (inClimb ? climb.grade : 0);
}
