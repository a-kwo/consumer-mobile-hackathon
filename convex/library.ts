/**
 * Maintenance for the song library that does not need a re-import. A `--replace`
 * import changes every song `_id`; patching by `deezerId` leaves them alone.
 */
import { v } from 'convex/values';

import { internalMutation } from './_generated/server';

const HEX = /^#[0-9A-Fa-f]{6}$/;

/**
 * Sets `coverColor` on songs, by deezerId. Send a few hundred rows per call.
 * Rows with a malformed colour or an unknown song are counted and skipped.
 * The rows come from `pipeline/cover_color.py --dump`.
 */
export const patchCoverColors = internalMutation({
  args: { rows: v.array(v.object({ deezerId: v.number(), coverColor: v.string() })) },
  returns: v.object({ patched: v.number(), unchanged: v.number(), unknown: v.number(), invalid: v.number() }),
  handler: async (ctx, { rows }) => {
    const counts = { patched: 0, unchanged: 0, unknown: 0, invalid: 0 };
    for (const { deezerId, coverColor } of rows) {
      if (!HEX.test(coverColor)) {
        counts.invalid += 1;
        continue;
      }
      const songs = await ctx.db
        .query('songs')
        .withIndex('by_deezerId', (q) => q.eq('deezerId', deezerId))
        .take(4);
      if (songs.length === 0) counts.unknown += 1;
      for (const song of songs) {
        if (song.coverColor === coverColor) {
          counts.unchanged += 1;
          continue;
        }
        await ctx.db.patch('songs', song._id, { coverColor });
        counts.patched += 1;
      }
    }
    return counts;
  },
});

/**
 * Copies `coverColor` from the library into plays logged before the field
 * existed. One page per call: pass the returned cursor back until `done`.
 */
export const backfillPlayCoverColors = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.object({ patched: v.number(), cursor: v.string(), done: v.boolean() }),
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.query('plays').paginate({ cursor, numItems: 200 });
    let patched = 0;
    for (const play of page.page) {
      if (play.coverColor !== undefined) continue;
      const song = await ctx.db
        .query('songs')
        .withIndex('by_deezerId', (q) => q.eq('deezerId', play.deezerId))
        .first();
      if (!song?.coverColor) continue;
      await ctx.db.patch('plays', play._id, { coverColor: song.coverColor });
      patched += 1;
    }
    return { patched, cursor: page.continueCursor, done: page.isDone };
  },
});
