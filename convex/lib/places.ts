/**
 * Turning geocoder answers into places the app can show. Pure: the fetching and
 * caching are in convex/places.ts.
 *
 * Two OpenStreetMap geocoders are understood, Nominatim and Photon. Both are
 * reduced to a `RawPlace` first, so naming and the setting guess are written once.
 */
import { TUNING } from '../tuning';
import type { Place, PlaceResult, Setting } from './validators';

/** What either geocoder says about one spot. */
export type RawPlace = {
  /** OpenStreetMap key and value of the feature found: "highway"/"secondary", "leisure"/"park". */
  kind: string;
  type: string;
  /** The feature's own name, if it has one. */
  name: string | null;
  road: string | null;
  area: string | null;
  city: string | null;
  /** True when `city` is a city or a town and not a village or county. */
  urban: boolean;
  lat: number;
  lon: number;
};

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);
const first = (...values: unknown[]): string | null => values.map(text).find((value) => value !== null) ?? null;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/** "City of New York" reads better as "New York". */
const cleanCity = (city: string | null) => city?.replace(/^(City|Town|Village) of /i, '') ?? null;
/** Administrative names such as "Manhattan Community Board 8" are not neighbourhoods anyone uses. */
const usable = (area: string | null) => (area && !/community board|\bdistrict \d|\bward \d/i.test(area) ? area : null);

/** One Nominatim result (format=jsonv2, addressdetails=1), from /reverse or /search. */
export function fromNominatim(body: unknown): RawPlace | null {
  if (!isRecord(body) || body.error || !isRecord(body.address)) return null;
  const address = body.address;
  const lat = Number(body.lat);
  const lon = Number(body.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const urbanCity = first(address.city, address.town);
  return {
    kind: text(body.category) ?? '',
    type: text(body.type) ?? '',
    name: text(body.name),
    road: first(address.road, address.pedestrian),
    area: first(usable(text(address.quarter)), usable(text(address.neighbourhood)), address.suburb, address.borough),
    city: cleanCity(first(urbanCity, address.village, address.municipality, address.hamlet, address.county)),
    urban: urbanCity !== null,
    lat,
    lon,
  };
}

/** One Photon feature, from /reverse or /api. */
export function fromPhoton(feature: unknown): RawPlace | null {
  if (!isRecord(feature) || !isRecord(feature.properties) || !isRecord(feature.geometry)) return null;
  const properties = feature.properties;
  const coordinates = feature.geometry.coordinates;
  if (!Array.isArray(coordinates)) return null;
  const [lon, lat] = coordinates.map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const kind = text(properties.osm_key) ?? '';
  const name = text(properties.name);
  return {
    kind,
    type: text(properties.osm_value) ?? '',
    name,
    // OpenStreetMap joins alternative names with ";". The first is the one to show.
    road: first(properties.street, kind === 'highway' ? name : null)?.split(';')[0].trim() || null,
    area: first(properties.locality, properties.district),
    city: cleanCity(first(properties.city, properties.county)),
    // Photon files towns and villages under `city` alike.
    urban: text(properties.city) !== null,
    lat,
    lon,
  };
}

/**
 * The name of the park a point is inside, from Photon features (asked for with
 * osm_tag=leisure:park). Photon gives each park's bounding box as
 * [west, north, east, south]; the first box that holds the point wins.
 */
export function parkContaining(features: unknown, lat: number, lon: number): string | null {
  if (!Array.isArray(features)) return null;
  for (const feature of features) {
    if (!isRecord(feature) || !isRecord(feature.properties)) continue;
    const { name, extent } = feature.properties;
    if (!text(name) || !Array.isArray(extent) || extent.length !== 4) continue;
    const [west, north, east, south] = extent.map(Number);
    if (lon >= west && lon <= east && lat >= south && lat <= north) return text(name);
  }
  return null;
}

/**
 * A railway station within `stationRadiusM` of a point, from Photon features
 * (asked for with osm_tag=railway:station), as the place to report; or null.
 */
export function stationNear(features: unknown, lat: number, lon: number): RawPlace | null {
  if (!Array.isArray(features)) return null;
  for (const feature of features) {
    const raw = fromPhoton(feature);
    if (!raw?.name) continue;
    const north = (raw.lat - lat) * 111_320;
    const east = (raw.lon - lon) * 111_320 * Math.cos((lat * Math.PI) / 180);
    if (Math.hypot(north, east) <= TUNING.geocode.stationRadiusM) return raw;
  }
  return null;
}

const has = (list: readonly string[], value: string) => list.includes(value);

const TRANSIT_RAILWAY = ['station', 'halt', 'stop', 'platform', 'subway_entrance', 'tram_stop'];
const TRANSIT_AMENITY = ['bus_station', 'ferry_terminal'];
const GYM_LEISURE = ['fitness_centre', 'sports_centre', 'sports_hall'];
const NATURE_LEISURE = ['park', 'garden', 'nature_reserve', 'dog_park', 'golf_course', 'beach_resort'];
const NATURE_LANDUSE = ['forest', 'meadow', 'grass', 'recreation_ground', 'village_green'];
const NATURE_HIGHWAY = ['path', 'track', 'bridleway'];
const NATURE_TOURISM = ['picnic_site', 'viewpoint', 'camp_site'];
/** Found in parks and outside them: nature only when a park is known to surround the point. */
const PARK_FURNITURE = ['pitch', 'playground', 'fitness_station', 'track', 'picnic_table', 'bandstand'];

export const isTransit = (raw: RawPlace) =>
  (raw.kind === 'railway' && has(TRANSIT_RAILWAY, raw.type)) ||
  raw.kind === 'aeroway' ||
  (raw.kind === 'amenity' && has(TRANSIT_AMENITY, raw.type)) ||
  (raw.kind === 'public_transport' && raw.type === 'station') ||
  (raw.kind === 'building' && (raw.type === 'train_station' || raw.type === 'transportation'));

export const isGym = (raw: RawPlace) =>
  (raw.kind === 'leisure' && has(GYM_LEISURE, raw.type)) || (raw.kind === 'amenity' && raw.type === 'gym');

export const isNature = (raw: RawPlace) =>
  raw.kind === 'natural' ||
  raw.kind === 'waterway' ||
  (raw.kind === 'leisure' && has(NATURE_LEISURE, raw.type)) ||
  (raw.kind === 'landuse' && has(NATURE_LANDUSE, raw.type)) ||
  (raw.kind === 'highway' && has(NATURE_HIGHWAY, raw.type)) ||
  (raw.kind === 'tourism' && has(NATURE_TOURISM, raw.type)) ||
  (raw.kind === 'boundary' && (raw.type === 'national_park' || raw.type === 'protected_area'));

/** Worth asking which park surrounds the point: green things, and things parks are full of. */
export const mayBeInPark = (raw: RawPlace) =>
  isNature(raw) ||
  (raw.kind === 'leisure' && has(PARK_FURNITURE, raw.type)) ||
  (raw.kind === 'highway' && (raw.type === 'footway' || raw.type === 'cycleway'));

/** The scene setting a place suggests. Never `indoors`: a map cannot see walls. */
export function settingFor(raw: RawPlace, park: string | null): Setting {
  if (isTransit(raw)) return 'transit';
  if (isGym(raw)) return 'gym';
  if (park || isNature(raw)) return 'nature';
  return raw.urban ? 'city' : 'any';
}

/** "5th Avenue, New York". Too long: the city goes first, then the end of the name. */
function labelFor(lead: string | null, city: string | null): string | null {
  const max = TUNING.geocode.labelMaxChars;
  const full = [lead, lead === city ? null : city].filter(Boolean).join(', ');
  if (!full) return null;
  if (full.length <= max) return full;
  const short = lead ?? full;
  return short.length <= max ? short : `${short.slice(0, max - 1).trimEnd()}…`;
}

/**
 * A place from what a geocoder said.
 *
 * `park` is the park surrounding the point, when one was found: the place is
 * then the park ("Central Park, New York"), with no street, so titles say "in
 * Central Park" and not the name of a drive through it.
 *
 * `named` is for searches: the user asked for a thing by name, so its own name
 * leads the label. A reverse lookup leads with the street instead, except at
 * stations, gyms and green places, which people do name.
 */
export function toPlace(raw: RawPlace, options: { park?: string | null; named?: boolean } = {}): PlaceResult | null {
  const park = options.park ?? (raw.kind === 'leisure' && raw.type === 'park' ? raw.name : null);
  const setting = settingFor(raw, park);
  const landmark = options.named || setting === 'transit' || setting === 'gym' || setting === 'nature';
  const lead = park ?? (landmark && raw.kind !== 'highway' ? raw.name : null) ?? raw.road ?? raw.name ?? raw.area;
  const label = labelFor(lead, raw.city);
  if (!label) return null;
  return {
    label,
    street: park ? null : raw.road,
    area: park ?? raw.area,
    city: raw.city,
    setting,
    lat: raw.lat,
    lon: raw.lon,
  };
}

export function withoutCoordinates(place: PlaceResult): Place {
  return { label: place.label, street: place.street, area: place.area, city: place.city, setting: place.setting };
}

/** The cache cell a coordinate falls in, with its centre. Null for coordinates off the globe. */
export function geocodeCell(lat: number, lon: number): { key: string; lat: number; lon: number } | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const size = TUNING.geocode.cellDegrees;
  const snap = (value: number) => Number((Math.round(value / size) * size).toFixed(4));
  const cellLat = snap(lat);
  const cellLon = snap(lon);
  return { key: `r:${cellLat.toFixed(4)},${cellLon.toFixed(4)}`, lat: cellLat, lon: cellLon };
}

/** A search query, trimmed and bounded, with its cache key. Null when it is too short to search for. */
export function searchQuery(query: string): { key: string; query: string } | null {
  const { queryMinChars, queryMaxChars } = TUNING.geocode;
  const cleaned = query.replace(/\s+/g, ' ').trim().slice(0, queryMaxChars).trim();
  if (cleaned.length < queryMinChars) return null;
  return { key: `s:${cleaned.toLowerCase()}`, query: cleaned };
}
