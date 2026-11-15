/** Geography helpers. Pure. */

export type Coordinates = { lat: number; lon: number };

const EARTH_RADIUS_M = 6371000;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Great-circle distance between two coordinates, in metres (haversine). */
export function distanceMeters(a: Coordinates, b: Coordinates): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLon = toRadians(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The address fields reverse geocoding returns that can name a place. */
export type GeocodedPlace = {
  street?: string | null;
  district?: string | null;
  name?: string | null;
  city?: string | null;
  subregion?: string | null;
  region?: string | null;
};

/**
 * A short name for where the user is: the street when there is one, else the
 * neighbourhood, else the place itself (a park, a station), else the city.
 */
export function placeNameFrom(place: GeocodedPlace | null | undefined): string | null {
  if (!place) return null;
  const candidates = [
    place.street,
    place.district,
    place.name,
    place.city,
    place.subregion,
    place.region,
  ];
  for (const candidate of candidates) {
    const name = typeof candidate === 'string' ? candidate.trim() : '';
    if (name) return name;
  }
  return null;
}
