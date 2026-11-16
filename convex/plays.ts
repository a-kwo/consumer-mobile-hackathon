import { v } from 'convex/values';

import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { type MutationCtx, internalMutation, mutation } from './_generated/server';
import { isClientDeviceId } from './lib/device';
import { clamp } from './lib/hash';
import { geocodeCell } from './lib/places';
import { normalizeHour } from './lib/scene';
import { cleanPlaceName, makeTitle } from './lib/titles';
import { type PlayContext, playContextV } from './lib/validators';
import { TUNING } from './tuning';

const MAX_LABEL_CHARS = 120;

export type NewPlay = {
  deviceId: string;
  deezerId: number;
  startedAt: number;
  context: PlayContext;
  sceneKey: string;
  sceneLabel: string;
  reason: string;
  /** The city the coordinates are in, when the caller knows it (the seeder does). */
  city?: string;
};

/** Bounds what a client can put in the log, and drops an empty place name. */
function cleanContext(context: PlayContext): PlayContext {
  const cleaned: PlayContext = {
    ...context,
    cadenceSpm: clamp(Number.isFinite(context.cadenceSpm) ? context.cadenceSpm : 0, 0, TUNING.maxCadenceSpm),
    localHour: normalizeHour(context.localHour),
  };
  const placeName = cleanPlaceName(context.placeName);
  if (placeName) cleaned.placeName = placeName;
  else delete cleaned.placeName;
  return cleaned;
}

/**
 * Writes one play: copies the song's details in by `deezerId` (the log must
 * survive a library re-import) and generates the entry title. Returns null when
 * the song is unknown. Logging the same play twice returns the first id.
 * Shared by `plays:log` and the seeded friends.
 */
export async function recordPlay(ctx: MutationCtx, play: NewPlay): Promise<Id<'plays'> | null> {
  if (!play.deviceId || !Number.isFinite(play.startedAt)) return null;
  let lookUpCity = false;
  const [song, sameMoment, earlier] = await Promise.all([
    ctx.db
      .query('songs')
      .withIndex('by_deezerId', (q) => q.eq('deezerId', play.deezerId))
      .first(),
    ctx.db
      .query('plays')
      .withIndex('by_device_startedAt', (q) => q.eq('deviceId', play.deviceId).eq('startedAt', play.startedAt))
      .take(4),
    // The titles just before this one, so the new title does not repeat them.
    ctx.db
      .query('plays')
      .withIndex('by_device_startedAt', (q) => q.eq('deviceId', play.deviceId).lt('startedAt', play.startedAt))
      .order('desc')
      .take(TUNING.titles.avoidRecent),
  ]);
  if (!song) return null;
  const duplicate = sameMoment.find((existing) => existing.deezerId === play.deezerId);
  if (duplicate) return duplicate._id;

  const context = cleanContext(play.context);
  // The friends map needs the play's city. The app has usually just asked
  // places:reverse about this spot, so the answer is in the cache; when it is
  // not, an action looks it up after this mutation and fills it in.
  const cell = context.lat === undefined || context.lon === undefined ? null : geocodeCell(context.lat, context.lon);
  let city = play.city;
  if (!city && cell) {
    const known = await ctx.db
      .query('placeCache')
      .withIndex('by_key', (q) => q.eq('key', cell.key))
      .first();
    city = known?.places[0]?.city ?? undefined;
    if (!known) lookUpCity = true;
  }
  const playId = await ctx.db.insert('plays', {
    deviceId: play.deviceId,
    deezerId: song.deezerId,
    songTitle: song.title,
    artist: song.artist,
    coverUrl: song.coverUrl,
    ...(song.coverColor === undefined ? {} : { coverColor: song.coverColor }),
    bpm: song.bpm,
    moods: song.moods.slice(0, 3),
    startedAt: play.startedAt,
    context,
    sceneKey: play.sceneKey.slice(0, MAX_LABEL_CHARS),
    sceneLabel: play.sceneLabel.slice(0, MAX_LABEL_CHARS),
    reason: play.reason.slice(0, MAX_LABEL_CHARS),
    title: makeTitle(context, song.deezerId, play.startedAt, {
      mood: song.moods[0],
      recentTitles: earlier.map((previous) => previous.title),
    }),
    skipped: false,
    ...(city ? { city } : {}),
  });
  if (lookUpCity && context.lat !== undefined && context.lon !== undefined) {
    await ctx.scheduler.runAfter(0, internal.places.labelPlay, { playId, lat: context.lat, lon: context.lon });
  }
  return playId;
}

/** Sets the city of a play once it is known. */
export const setCity = internalMutation({
  args: { playId: v.id('plays'), city: v.string() },
  returns: v.null(),
  handler: async (ctx, { playId, city }) => {
    if (await ctx.db.get('plays', playId)) await ctx.db.patch('plays', playId, { city });
    return null;
  },
});

/**
 * Logs a play when playback of a pick actually starts. The server copies the
 * song details in by `deezerId` and generates the entry title. CONTRACT: frozen.
 */
export const log = mutation({
  args: {
    deviceId: v.string(),
    deezerId: v.number(),
    startedAt: v.number(),
    context: playContextV,
    sceneKey: v.string(),
    sceneLabel: v.string(),
    reason: v.string(),
  },
  returns: v.union(v.id('plays'), v.null()),
  // Seeded friends are written by the seeder only, through recordPlay directly.
  handler: async (ctx, args) => (isClientDeviceId(args.deviceId) ? recordPlay(ctx, args) : null),
});

/**
 * Marks a play as skipped. A play skipped within `skipHideMs` of starting was
 * never really heard and is hidden from the soundtrack; skipped later, it was
 * part of the day and stays. The server's clock is compared with the play's
 * `startedAt`, which came from the phone. CONTRACT: frozen.
 */
export const markSkipped = mutation({
  args: { deviceId: v.string(), playId: v.id('plays') },
  returns: v.null(),
  handler: async (ctx, { deviceId, playId }) => {
    if (!isClientDeviceId(deviceId)) return null;
    const play = await ctx.db.get('plays', playId);
    // Someone else's play, or one that is already gone: nothing to do.
    if (!play || play.deviceId !== deviceId || play.skipped) return null;
    const hidden = Date.now() - play.startedAt < TUNING.skipHideMs;
    await ctx.db.patch('plays', playId, hidden ? { skipped: true, hidden: true } : { skipped: true });
    return null;
  },
});

/**
 * Deletes the plays and profiles of test devices: every deviceId starting with `prefix`.
 * Run by hand after smoke tests, e.g. `npx convex run plays:purgeTestDevices '{"prefix":"sim-smoke-"}'`.
 * Refuses a prefix that could match real or seeded devices.
 */
export const purgeTestDevices = internalMutation({
  args: { prefix: v.string() },
  returns: v.object({ deleted: v.number(), more: v.boolean() }),
  handler: async (ctx, { prefix }) => {
    if (!prefix.startsWith(TUNING.feed.testDevicePrefix) || prefix.length < TUNING.feed.testDevicePrefix.length + 3) {
      throw new Error(`prefix must start with "${TUNING.feed.testDevicePrefix}" and name a test run`);
    }
    const limit = 500;
    const rows = await ctx.db
      .query('plays')
      .withIndex('by_device_startedAt', (q) => q.gte('deviceId', prefix).lt('deviceId', `${prefix}\uffff`))
      .take(limit);
    await Promise.all(rows.map((row) => ctx.db.delete('plays', row._id)));
    // Their profiles go too, once the plays are gone.
    const profiles =
      rows.length === limit
        ? []
        : await ctx.db
            .query('profiles')
            .withIndex('by_deviceId', (q) => q.gte('deviceId', prefix).lt('deviceId', `${prefix}\uffff`))
            .take(limit);
    await Promise.all(profiles.map((profile) => ctx.db.delete('profiles', profile._id)));
    return { deleted: rows.length + profiles.length, more: rows.length === limit || profiles.length === limit };
  },
});
