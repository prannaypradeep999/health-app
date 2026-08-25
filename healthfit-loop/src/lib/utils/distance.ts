export type DistancePreference = 'close' | 'medium' | 'far';

// The single mile table. Two disagreeing copies previously existed: the Places
// search radius and the Sonar prompt used 1/3/8 while the meal-selection prompt
// told the model 2/5/10, so the model optimised against a radius the search had
// never used.
export const DISTANCE_RADIUS_MILES: Record<DistancePreference, number> = {
  close: 1.0,
  medium: 3.0,
  far: 8.0,
};

export function radiusMilesFor(preference: string | null | undefined): number {
  const key = (preference || '').toLowerCase();
  if (key === 'close' || key === 'medium' || key === 'far') {
    return DISTANCE_RADIUS_MILES[key];
  }
  return DISTANCE_RADIUS_MILES.medium;
}

const EARTH_RADIUS_MILES = 3958.8;
const toRad = (deg: number) => (deg * Math.PI) / 180;

export function milesBetween(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}
