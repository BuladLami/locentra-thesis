import type { Site } from "@/types/polaris";

const EARTH_RADIUS_M = 6_371_000;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in metres. */
export function haversineM(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface NearestSite {
  site: Site;
  distanceM: number;
}

/** Nearest scored candidate site to an arbitrary point. */
export function findNearestSite(
  sites: readonly Site[],
  lat: number,
  lon: number,
): NearestSite | null {
  let best: Site | null = null;
  let bestD = Infinity;

  for (const site of sites) {
    const d = haversineM(lat, lon, site.latitude, site.longitude);
    if (d < bestD) {
      bestD = d;
      best = site;
    }
  }
  return best ? { site: best, distanceM: bestD } : null;
}

/** Every site within `radiusM` of the centre, paired with its distance. */
export function sitesWithinRadius(
  sites: readonly Site[],
  lat: number,
  lon: number,
  radiusM: number,
): { site: Site; distanceM: number }[] {
  const out: { site: Site; distanceM: number }[] = [];
  for (const site of sites) {
    const d = haversineM(lat, lon, site.latitude, site.longitude);
    if (d <= radiusM) out.push({ site, distanceM: d });
  }
  return out;
}

/** Metres-per-pixel of a Web Mercator tile pyramid at a given zoom/latitude. */
export function metresPerPixel(latitude: number, zoom: number): number {
  return (156543.03392 * Math.cos(toRad(latitude))) / 2 ** zoom;
}

export interface LngLatBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export function boundsOfSites(sites: readonly Site[]): LngLatBounds | null {
  if (sites.length === 0) return null;
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;

  for (const s of sites) {
    if (s.longitude < west) west = s.longitude;
    if (s.longitude > east) east = s.longitude;
    if (s.latitude < south) south = s.latitude;
    if (s.latitude > north) north = s.latitude;
  }
  return { west, south, east, north };
}

export function isInsideBounds(
  lat: number,
  lon: number,
  b: LngLatBounds,
  padDeg = 0,
): boolean {
  return (
    lon >= b.west - padDeg &&
    lon <= b.east + padDeg &&
    lat >= b.south - padDeg &&
    lat <= b.north + padDeg
  );
}
