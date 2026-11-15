import { v } from 'convex/values';

import type { Id } from './_generated/dataModel';
import { type MutationCtx, internalMutation, mutation } from './_generated/server';
import { isClientDeviceId } from './lib/device';
import { clamp } from './lib/hash';
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
  return await ctx.db.insert('plays', {
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
  });
}

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

/** Marks a play as skipped, which hides it from the soundtrack. CONTRACT: frozen. */
export const markSkipped = mutation({
  args: { deviceId: v.string(), playId: v.id('plays') },
  returns: v.null(),
  handler: async (ctx, { deviceId, playId }) => {
    if (!isClientDeviceId(deviceId)) return null;
    const play = await ctx.db.get('plays', playId);
    // Someone else's play, or one that is already gone: nothing to do.
    if (!play || play.deviceId !== deviceId || play.skipped) return null;
    await ctx.db.patch('plays', playId, { skipped: true });
    return null;
  },
});

/**
 * Deletes the plays of test devices: every deviceId starting with `prefix`.
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
    return { deleted: rows.length, more: rows.length === limit };
  },
});
