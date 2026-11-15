import { v } from 'convex/values';

import { action } from './_generated/server';
import { clamp } from './lib/hash';
import { pickOrder, reasonFor } from './lib/match';
import { freshPreview } from './lib/preview';
import { buildScene, normalizeHour } from './lib/scene';
import { type Scene, type Track, nudgeV, sceneV, settingV, trackV, weatherV } from './lib/validators';
import { findCandidates } from './match';
import { TUNING } from './tuning';
import { type WeatherReading, resolveWeather } from './weather';

type PickResult = { scene: Scene; track: Track | null; error: null | 'empty_library' | 'no_preview' };

const finite = (value: number | undefined, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

/**
 * Picks the song that best fits the moment. CONTRACT: the argument and return
 * shapes below are frozen; the app's playback engine is built against them.
 *
 * No LLM and no embedding model: the scene embedding is precomputed in `scenes`.
 */
export const pick = action({
  args: {
    deviceId: v.string(),
    cadenceSpm: v.number(),
    speedMps: v.optional(v.number()),
    lat: v.optional(v.number()),
    lon: v.optional(v.number()),
    /** Local hour of day as a float, 0 to 24. */
    localHour: v.number(),
    setting: v.optional(settingV),
    /** Set by the simulator. When absent the weather comes from lat/lon, or is `any`. */
    weatherOverride: v.optional(weatherV),
    /** What triggered this pick, when it was a tap. Used for the reason line. */
    nudge: v.optional(nudgeV),
    /** Energy bias the client is carrying from recent nudges. */
    energyBias: v.optional(v.number()),
    /** Songs the client already holds (playing or preloaded), on top of the server-side recent-plays exclusion. */
    excludeDeezerIds: v.optional(v.array(v.number())),
  },
  returns: v.object({
    scene: sceneV,
    track: v.union(trackV, v.null()),
    /** Set when `track` is null. */
    error: v.union(v.null(), v.literal('empty_library'), v.literal('no_preview')),
  }),
  handler: async (ctx, args): Promise<PickResult> => {
    const startedAt = Date.now();
    if (args.deviceId.length > TUNING.maxDeviceIdChars) throw new Error('invalid deviceId');

    let reading: WeatherReading = { weather: 'any', temperatureC: null };
    if (args.weatherOverride !== undefined) {
      reading = { weather: args.weatherOverride, temperatureC: null };
    } else if (args.lat !== undefined && args.lon !== undefined) {
      reading = await resolveWeather(ctx, args.lat, args.lon);
    }
    const weatherAt = Date.now();

    const scene = buildScene({
      cadenceSpm: clamp(finite(args.cadenceSpm, 0), 0, TUNING.maxCadenceSpm),
      localHour: normalizeHour(args.localHour),
      weather: reading.weather,
      setting: args.setting ?? 'any',
      energyBias: clamp(finite(args.energyBias, 0), -TUNING.maxEnergyBias, TUNING.maxEnergyBias),
      temperatureC: reading.temperatureC,
    });

    const excludeDeezerIds = (args.excludeDeezerIds ?? [])
      .filter((id) => Number.isFinite(id))
      .slice(0, TUNING.maxClientExcludes);
    const found = await findCandidates(ctx, { deviceId: args.deviceId, scene, excludeDeezerIds });
    const matchedAt = Date.now();
    if (found.libraryEmpty) return { scene, track: null, error: 'empty_library' };

    // The random pick happens here, in the action: queries must stay deterministic.
    const order = pickOrder(found.ranked, Math.random(), TUNING.preview.maxCandidates);
    const deadline = matchedAt + TUNING.preview.budgetMs;
    for (const candidate of order) {
      const { preview, blocked } = await freshPreview(candidate, deadline);
      // Throttled or out of time: asking about more songs would only make it worse.
      if (blocked && !preview) break;
      if (!preview) continue;
      const reason = reasonFor(candidate, scene, args.nudge);
      console.log(
        `pick ${scene.key} -> "${candidate.title}" ${Math.round(candidate.bpm)} BPM, ` +
          `pool ${found.pool}, preview ${preview.source}: weather ${weatherAt - startedAt} ms, ` +
          `match ${matchedAt - weatherAt} ms, preview ${Date.now() - matchedAt} ms`,
      );
      return {
        scene,
        track: {
          deezerId: candidate.deezerId,
          title: candidate.title,
          artist: candidate.artist,
          coverUrl: candidate.coverUrl,
          ...(candidate.coverColor === undefined ? {} : { coverColor: candidate.coverColor }),
          previewUrl: preview.url,
          bpm: candidate.bpm,
          energy: candidate.energy,
          valence: candidate.valence,
          moods: candidate.moods,
          reason,
        },
        error: null,
      };
    }
    console.warn(`pick ${scene.key}: no preview after ${Date.now() - matchedAt} ms (tried up to ${order.length} songs)`);
    return { scene, track: null, error: 'no_preview' };
  },
});
