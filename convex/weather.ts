import { v } from 'convex/values';

import { internal } from './_generated/api';
import { type ActionCtx, action, internalMutation, internalQuery } from './_generated/server';
import { fetchJson } from './lib/preview';
import { type Weather, WEATHERS, weatherV } from './lib/validators';
import { TUNING } from './tuning';

export type WeatherReading = { weather: Weather; temperatureC: number | null };

const UNKNOWN: WeatherReading = { weather: 'any', temperatureC: null };

const isWeather = (value: string): value is Weather => (WEATHERS as readonly string[]).includes(value);

/** WMO weather interpretation codes, as Open-Meteo reports them. */
export function weatherForWmoCode(code: number): Weather {
  if (code === 0 || code === 1) return 'clear';
  if (code === 2 || code === 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95 && code <= 99) return 'storm';
  return 'any';
}

/** The cache cell a coordinate falls in, with the cell's centre. Null for coordinates off the globe. */
export function weatherCell(lat: number, lon: number): { cell: string; lat: number; lon: number } | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const size = TUNING.weatherCellDegrees;
  const snap = (value: number) => Number((Math.round(value / size) * size).toFixed(4));
  const cellLat = snap(lat);
  const cellLon = snap(lon);
  return { cell: `${cellLat.toFixed(3)},${cellLon.toFixed(3)}`, lat: cellLat, lon: cellLon };
}

const cachedV = v.object({
  weather: weatherV,
  temperatureC: v.union(v.number(), v.null()),
  fetchedAt: v.number(),
});

export const cached = internalQuery({
  args: { cell: v.string() },
  returns: v.union(cachedV, v.null()),
  handler: async (ctx, { cell }) => {
    const row = await ctx.db
      .query('weatherCache')
      .withIndex('by_cell', (q) => q.eq('cell', cell))
      .first();
    if (!row) return null;
    return {
      weather: isWeather(row.weather) ? row.weather : ('any' as const),
      temperatureC: row.temperatureC,
      fetchedAt: row.fetchedAt,
    };
  },
});

export const store = internalMutation({
  args: { cell: v.string(), weather: weatherV, temperatureC: v.union(v.number(), v.null()), fetchedAt: v.number() },
  returns: v.null(),
  handler: async (ctx, { cell, weather, temperatureC, fetchedAt }) => {
    const rows = await ctx.db
      .query('weatherCache')
      .withIndex('by_cell', (q) => q.eq('cell', cell))
      .take(8);
    const [row, ...duplicates] = rows;
    if (row) await ctx.db.patch('weatherCache', row._id, { weather, temperatureC, fetchedAt });
    else await ctx.db.insert('weatherCache', { cell, weather, temperatureC, fetchedAt });
    await Promise.all(duplicates.map((duplicate) => ctx.db.delete('weatherCache', duplicate._id)));
    return null;
  },
});

const temperatureOf = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/** Asks Open-Meteo (keyless) for the weather right now. Null when the call fails. */
async function fetchOpenMeteo(lat: number, lon: number): Promise<WeatherReading | null> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    '&current=temperature_2m,weather_code,is_day,precipitation';
  const body = await fetchJson(url, TUNING.weatherTimeoutMs);
  const current = (body as { current?: Record<string, unknown> } | null)?.current;
  if (!current || typeof current.weather_code !== 'number') return null;
  return { weather: weatherForWmoCode(current.weather_code), temperatureC: temperatureOf(current.temperature_2m) };
}

/** MET Norway symbol codes, such as "lightrainshowers_day" or "heavysnowandthunder". */
export function weatherForMetSymbol(symbol: string): Weather {
  if (symbol.includes('thunder')) return 'storm';
  if (symbol.includes('snow')) return 'snow';
  if (symbol.includes('rain') || symbol.includes('sleet')) return 'rain';
  if (symbol.includes('fog')) return 'fog';
  if (symbol.includes('clearsky') || symbol.includes('fair')) return 'clear';
  if (symbol.includes('cloudy')) return 'cloudy';
  return 'any';
}

/**
 * Second source: MET Norway's Locationforecast, also keyless and worldwide.
 * Open-Meteo limits requests per IP per day, and Convex's servers share their
 * IPs with every other Convex app, so from here Open-Meteo is often already
 * over its limit (HTTP 429).
 */
async function fetchMetNorway(lat: number, lon: number): Promise<WeatherReading | null> {
  const url = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat}&lon=${lon}`;
  const body = (await fetchJson(url, TUNING.weatherTimeoutMs)) as {
    properties?: { timeseries?: { data?: Record<string, { summary?: { symbol_code?: unknown }; details?: Record<string, unknown> }> }[] };
  } | null;
  const now = body?.properties?.timeseries?.[0]?.data;
  const symbol = now?.next_1_hours?.summary?.symbol_code ?? now?.next_6_hours?.summary?.symbol_code;
  if (typeof symbol !== 'string') return null;
  return { weather: weatherForMetSymbol(symbol), temperatureC: temperatureOf(now?.instant?.details?.air_temperature) };
}

/**
 * Weather at a coordinate: the cell's cache row while it is fresh, else a new
 * reading from Open-Meteo or, failing that, MET Norway (stored for next time),
 * else the stale row, else `any`. Shared by `weather:current` and `next:pick`.
 */
export async function resolveWeather(ctx: ActionCtx, lat: number, lon: number): Promise<WeatherReading> {
  const cell = weatherCell(lat, lon);
  if (!cell) return UNKNOWN;
  const row: { weather: Weather; temperatureC: number | null; fetchedAt: number } | null = await ctx.runQuery(
    internal.weather.cached,
    { cell: cell.cell },
  );
  const now = Date.now();
  if (row && now - row.fetchedAt < TUNING.weatherCacheMs) {
    return { weather: row.weather, temperatureC: row.temperatureC };
  }
  const fresh = (await fetchOpenMeteo(cell.lat, cell.lon)) ?? (await fetchMetNorway(cell.lat, cell.lon));
  if (!fresh) return row ? { weather: row.weather, temperatureC: row.temperatureC } : UNKNOWN;
  await ctx.runMutation(internal.weather.store, { cell: cell.cell, ...fresh, fetchedAt: now });
  return fresh;
}

/**
 * Current weather at a coordinate, cached per cell. The app shows it on the Now
 * screen and feeds it to the local scene preview. CONTRACT: frozen.
 */
export const current = action({
  args: { lat: v.number(), lon: v.number() },
  returns: v.object({ weather: weatherV, temperatureC: v.union(v.number(), v.null()) }),
  handler: async (ctx, { lat, lon }): Promise<WeatherReading> => resolveWeather(ctx, lat, lon),
});
