/**
 * Distance between trip points.
 *
 * The prototype has no maps service yet (provider and cost are still to be chosen), so the
 * demo provider estimates driving miles from straight-line distance between saved places that
 * have coordinates. It is clearly labeled as an estimate in the UI. When a point has no
 * coordinates (a typed address), there is no estimate and the person enters miles themselves.
 */
export type RoutePoint = { lat: number | null; lng: number | null };

export type DistanceProvider = {
  /** Human label shown next to estimates. */
  label: string;
  /** Total miles along the points in order (plus the way back if roundTrip), or null if unknown. */
  estimate(points: RoutePoint[], roundTrip: boolean): Promise<number | null>;
};

const EARTH_RADIUS_MILES = 3958.8;
/** Roads are longer than a straight line; ~1.25 is a common rule of thumb for city driving. */
const ROAD_FACTOR = 1.25;

export function straightLineMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(h));
}

/** Synchronous demo estimate, shared by the server and the trip form (for a live preview). */
export function demoEstimateMiles(points: RoutePoint[], roundTrip: boolean): number | null {
  if (points.length < 2) return null;
  const known: { lat: number; lng: number }[] = [];
  for (const p of points) {
    if (p.lat === null || p.lng === null || !Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return null;
    known.push({ lat: p.lat, lng: p.lng });
  }
  let miles = 0;
  for (let i = 1; i < known.length; i++) miles += straightLineMiles(known[i - 1], known[i]) * ROAD_FACTOR;
  if (roundTrip) miles += straightLineMiles(known[known.length - 1], known[0]) * ROAD_FACTOR;
  const rounded = Math.round(miles * 10) / 10;
  return rounded > 0 ? rounded : null;
}

export const demoDistanceProvider: DistanceProvider = {
  label: "Estimate (demo)",
  async estimate(points, roundTrip) {
    return demoEstimateMiles(points, roundTrip);
  },
};

export function getDistanceProvider(): DistanceProvider {
  return demoDistanceProvider;
}
