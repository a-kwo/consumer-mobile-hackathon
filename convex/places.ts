/**
 * Places by name: where a coordinate is ("5th Avenue, New York") and where a
 * typed place is. Keyless OpenStreetMap geocoders, cached for a day.
 *
 * Nominatim is asked first. Its usage policy is followed: an identifying
 * User-Agent, at most one request a second across the whole deployment (the
 * `gate:nominatim` row hands out time slots), and results are cached. When
 * Nominatim fails or its queue is long, Photon answers instead. Photon also
 * says which park surrounds a point, which Nominatim does not.
 *
 * Failures return null or [] and are not cached; "nothing there" is cached.
 */
import { v } from 'convex/values';

import { internal } from './_generated/api';
import { type ActionCtx, action, internalAction, internalMutation, internalQuery } from './_generated/server';
import {
  type RawPlace,
  fromNominatim,
  fromPhoton,
  geocodeCell,
  mayBeInPark,
  parkContaining,
  searchQuery,
  stationNear,
  toPlace,
  withoutCoordinates,
} from './lib/places';
import { fetchJson } from './lib/preview';
import { type Place, type PlaceResult, placeResultV, placeV } from './lib/validators';
import { TUNING } from './tuning';

const NOMINATIM = 'https://nominatim.openstreetmap.org';
const PHOTON = 'https://photon.komoot.io';
const GATE = 'gate:nominatim';
const HEADERS = { 'User-Agent': TUNING.weatherUserAgent, 'Accept-Language': 'en' };

const get = (url: string) => fetchJson(url, TUNING.geocode.timeoutMs, HEADERS);

/** A cached answer that is still fresh, or null. An empty list is an answer: nothing is there. */
export const cached = internalQuery({
  args: { key: v.string(), now: v.number() },
  returns: v.union(v.array(placeResultV), v.null()),
  handler: async (ctx, { key, now }) => {
    const row = await ctx.db
      .query('placeCache')
      .withIndex('by_key', (q) => q.eq('key', key))
      .first();
    return row && now - row.fetchedAt < TUNING.geocode.cacheMs ? row.places : null;
  },
});

export const store = internalMutation({
  args: { key: v.string(), places: v.array(placeResultV), fetchedAt: v.number() },
  returns: v.null(),
  handler: async (ctx, { key, places, fetchedAt }) => {
    if (key === GATE) return null;
    const row = await ctx.db
      .query('placeCache')
      .withIndex('by_key', (q) => q.eq('key', key))
      .first();
    if (row) await ctx.db.patch('placeCache', row._id, { places, fetchedAt });
    else await ctx.db.insert('placeCache', { key, places, fetchedAt });
    return null;
  },
});

/**
 * Books the next free one-second slot for a Nominatim request and returns how
 * long to wait for it, or null when the queue is too long to be worth joining.
 */
export const reserveNominatimSlot = internalMutation({
  args: { now: v.number() },
  returns: v.union(v.number(), v.null()),
  handler: async (ctx, { now }) => {
    const gate = await ctx.db
      .query('placeCache')
      .withIndex('by_key', (q) => q.eq('key', GATE))
      .first();
    const slot = Math.max(now, gate?.fetchedAt ?? 0);
    if (slot - now > TUNING.geocode.maxWaitMs) return null;
    const next = slot + TUNING.geocode.minIntervalMs;
    if (gate) await ctx.db.patch('placeCache', gate._id, { fetchedAt: next });
    else await ctx.db.insert('placeCache', { key: GATE, places: [], fetchedAt: next });
    return slot - now;
  },
});

/**
 * Closes the gate for `nominatimCooldownMs`. Convex's servers share their IPs
 * with every other Convex app, and Nominatim throttles by IP (HTTP 429): asking
 * again at once would be both useless and rude.
 */
export const pauseNominatim = internalMutation({
  args: { now: v.number() },
  returns: v.null(),
  handler: async (ctx, { now }) => {
    const gate = await ctx.db
      .query('placeCache')
      .withIndex('by_key', (q) => q.eq('key', GATE))
      .first();
    const until = now + TUNING.geocode.nominatimCooldownMs;
    if (gate) await ctx.db.patch('placeCache', gate._id, { fetchedAt: until });
    else await ctx.db.insert('placeCache', { key: GATE, places: [], fetchedAt: until });
    return null;
  },
});

/** One Nominatim request in its own time slot. Null when it failed, is cooling down, or the queue was too long. */
async function nominatim(ctx: ActionCtx, path: string): Promise<unknown> {
  const wait: number | null = await ctx.runMutation(internal.places.reserveNominatimSlot, { now: Date.now() });
  if (wait === null) return null;
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  const body = await get(`${NOMINATIM}${path}&format=jsonv2&addressdetails=1&accept-language=en`);
  if (body === null) await ctx.runMutation(internal.places.pauseNominatim, { now: Date.now() });
  return body;
}

const photonFeatures = (body: unknown): unknown[] => {
  const features = (body as { features?: unknown } | null)?.features;
  return Array.isArray(features) ? features : [];
};

type Looked = { source: 'nominatim' | 'photon'; found: RawPlace[] } | null;

async function lookUpPoint(ctx: ActionCtx, lat: number, lon: number): Promise<Looked> {
  const body = await nominatim(ctx, `/reverse?lat=${lat}&lon=${lon}&zoom=18`);
  if (body !== null) {
    const raw = fromNominatim(body);
    return { source: 'nominatim', found: raw ? [raw] : [] };
  }
  // Photon names the nearest thing, usually the street. A station you are standing
  // in is asked for separately, since Photon would otherwise report the road outside.
  const [fallback, stations] = await Promise.all([
    get(`${PHOTON}/reverse?lat=${lat}&lon=${lon}&lang=en`),
    get(`${PHOTON}/reverse?lat=${lat}&lon=${lon}&lang=en&osm_tag=railway:station&radius=0.25&limit=3`),
  ]);
  if (fallback === null) return null;
  const nearest = fromPhoton(photonFeatures(fallback)[0]);
  const station = stationNear(photonFeatures(stations), lat, lon);
  const raw = station && nearest ? { ...nearest, kind: station.kind, type: station.type, name: station.name } : nearest;
  return { source: 'photon', found: raw ? [raw] : [] };
}

async function lookUpName(ctx: ActionCtx, query: string): Promise<Looked> {
  const limit = TUNING.geocode.maxResults;
  const q = encodeURIComponent(query);
  const body = await nominatim(ctx, `/search?q=${q}&limit=${limit}`);
  if (Array.isArray(body)) {
    return { source: 'nominatim', found: body.map(fromNominatim).filter((raw) => raw !== null) };
  }
  const fallback = await get(`${PHOTON}/api?q=${q}&limit=${limit}&lang=en`);
  if (fallback === null) return null;
  return { source: 'photon', found: photonFeatures(fallback).map(fromPhoton).filter((raw) => raw !== null) };
}

/** The park around a point, or null. One Photon request, made only for green-looking places. */
async function parkAround(lat: number, lon: number): Promise<string | null> {
  const body = await get(
    `${PHOTON}/reverse?lat=${lat}&lon=${lon}&lang=en&osm_tag=leisure:park&limit=3&radius=${TUNING.geocode.parkRadiusKm}`,
  );
  return parkContaining(photonFeatures(body), lat, lon);
}

/**
 * The place at a coordinate, from the cache or the geocoders. Shared with the
 * feed, which needs the city of a play. Null when nothing is there or the lookup failed.
 */
export async function reversePlace(ctx: ActionCtx, lat: number, lon: number): Promise<PlaceResult | null> {
  const cell = geocodeCell(lat, lon);
  if (!cell) return null;
  const now = Date.now();
  const hit: PlaceResult[] | null = await ctx.runQuery(internal.places.cached, { key: cell.key, now });
  if (hit) return hit[0] ?? null;

  // Asked about the point itself, not the cell centre: 25 m is the difference
  // between a station and the street outside it. The answer then stands for the cell.
  const at = { lat: Number(lat.toFixed(5)), lon: Number(lon.toFixed(5)) };
  const looked = await lookUpPoint(ctx, at.lat, at.lon);
  if (!looked) return null;
  const raw = looked.found[0];
  const park = raw && mayBeInPark(raw) ? await parkAround(at.lat, at.lon) : null;
  const place = raw ? toPlace({ ...raw, ...at }, { park }) : null;
  console.log(`places:reverse ${cell.key} via ${looked.source} -> ${place?.label ?? 'nothing'}`);
  await ctx.runMutation(internal.places.store, { key: cell.key, places: place ? [place] : [], fetchedAt: now });
  return place;
}

/** Finds the city of a logged play and stores it, for the friends map. Scheduled by plays:log on a cache miss. */
export const labelPlay = internalAction({
  args: { playId: v.id('plays'), lat: v.number(), lon: v.number() },
  returns: v.null(),
  handler: async (ctx, { playId, lat, lon }): Promise<null> => {
    const place = await reversePlace(ctx, lat, lon);
    if (place?.city) await ctx.runMutation(internal.plays.setCity, { playId, city: place.city });
    return null;
  },
});

/** Where a coordinate is, by name. Null when nothing is found or the lookup fails. */
export const reverse = action({
  args: { lat: v.number(), lon: v.number() },
  returns: v.union(placeV, v.null()),
  handler: async (ctx, { lat, lon }): Promise<Place | null> => {
    const place = await reversePlace(ctx, lat, lon);
    return place ? withoutCoordinates(place) : null;
  },
});

/** Up to five places matching a typed name. [] for a query under two characters or on failure. */
export const search = action({
  args: { query: v.string() },
  returns: v.array(placeResultV),
  handler: async (ctx, args): Promise<PlaceResult[]> => {
    const wanted = searchQuery(args.query);
    if (!wanted) return [];
    const now = Date.now();
    const hit: PlaceResult[] | null = await ctx.runQuery(internal.places.cached, { key: wanted.key, now });
    if (hit) return hit;

    const looked = await lookUpName(ctx, wanted.query);
    if (!looked) return [];
    const labels = new Set<string>();
    const places: PlaceResult[] = [];
    for (const raw of looked.found) {
      const place = toPlace(raw, { named: true });
      // Long roads come back as several segments with one name: one is enough.
      if (!place || labels.has(place.label)) continue;
      labels.add(place.label);
      places.push(place);
    }
    const results = places.slice(0, TUNING.geocode.maxResults);
    console.log(`places:search "${wanted.query}" via ${looked.source} -> ${results.length}`);
    await ctx.runMutation(internal.places.store, { key: wanted.key, places: results, fetchedAt: now });
    return results;
  },
});
