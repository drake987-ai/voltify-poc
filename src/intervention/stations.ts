// A simulated battery-swap network: a jittered lattice of stations about 1.4 km
// apart over each city box, each holding a few "cool" (charged, not hot) packs.
// The platform would read the real network from the operators' APIs; here it is
// generated deterministically so every run sees the same stations.
import { CITY_BOX, METRES_PER_DEG_LAT, type City } from '../sim/params';
import { hashString } from '../sim/rng';

export interface Station {
  id: string;
  city: City;
  lat: number;
  lng: number;
  /** Charged, cool packs ready to be handed out (0 = the station cannot serve a swap). */
  coolPacks: number;
}

const LATTICE_STEP_DEG = 0.0125; // about 1.39 km

const cache = new Map<City, Station[]>();

/** Uniform in [0, 1) from a string key, independent of any simulation seed. */
const unit = (key: string) => hashString(key) / 4294967296;

export function stationsFor(city: City): Station[] {
  const cached = cache.get(city);
  if (cached) return cached;
  const box = CITY_BOX[city];
  const stations: Station[] = [];
  const prefix = city === 'hcmc' ? 'HCM' : 'HN';
  let index = 1;
  for (let lat = box.latMin + LATTICE_STEP_DEG / 2; lat <= box.latMax; lat += LATTICE_STEP_DEG) {
    const lngStep = LATTICE_STEP_DEG / Math.cos((lat * Math.PI) / 180);
    for (let lng = box.lngMin + lngStep / 2; lng <= box.lngMax; lng += lngStep) {
      const key = `${city}:${index}`;
      stations.push({
        id: `${prefix}-${String(index).padStart(3, '0')}`,
        city,
        lat: lat + (unit(`${key}:lat`) - 0.5) * 0.4 * LATTICE_STEP_DEG,
        lng: lng + (unit(`${key}:lng`) - 0.5) * 0.4 * lngStep,
        // About one station in six has no cool pack at the moment.
        coolPacks: unit(`${key}:stock`) < 1 / 6 ? 0 : 1 + Math.floor(unit(`${key}:n`) * 5),
      });
      index++;
    }
  }
  cache.set(city, stations);
  return stations;
}

/** Straight-line distance in metres (equirectangular approximation, fine at city scale). */
export function distanceM(latA: number, lngA: number, latB: number, lngB: number): number {
  const mPerDegLng = METRES_PER_DEG_LAT * Math.cos((((latA + latB) / 2) * Math.PI) / 180);
  return Math.hypot((latB - latA) * METRES_PER_DEG_LAT, (lngB - lngA) * mPerDegLng);
}

export interface NearestStation {
  station: Station;
  distanceM: number;
}

/** Nearest station that has at least `minCoolPacks` cool packs, or null if none does. */
export function nearestStation(city: City, lat: number, lng: number, minCoolPacks = 1): NearestStation | null {
  let best: NearestStation | null = null;
  for (const station of stationsFor(city)) {
    if (station.coolPacks < minCoolPacks) continue;
    const d = distanceM(lat, lng, station.lat, station.lng);
    if (best === null || d < best.distanceM) best = { station, distanceM: d };
  }
  return best;
}
