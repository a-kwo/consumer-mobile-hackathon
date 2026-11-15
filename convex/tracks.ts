import { v } from 'convex/values';

import { internal } from './_generated/api';
import { action, internalQuery } from './_generated/server';
import { freshPreview } from './lib/preview';

/**
 * What the preview lookup needs for a deezerId: from the library, or from the
 * newest play that copied the names in when the song has since left the library.
 */
export const lookup = internalQuery({
  args: { deezerId: v.number() },
  returns: v.union(
    v.object({ artist: v.string(), title: v.string(), itunesTrackId: v.optional(v.number()) }),
    v.null(),
  ),
  handler: async (ctx, { deezerId }) => {
    const song = await ctx.db
      .query('songs')
      .withIndex('by_deezerId', (q) => q.eq('deezerId', deezerId))
      .first();
    if (song) {
      const { artist, title, itunesTrackId } = song;
      return itunesTrackId === undefined ? { artist, title } : { artist, title, itunesTrackId };
    }
    const play = await ctx.db
      .query('plays')
      .withIndex('by_deezerId', (q) => q.eq('deezerId', deezerId))
      .order('desc')
      .first();
    return play ? { artist: play.artist, title: play.songTitle } : null;
  },
});

/**
 * A fresh preview URL for replaying a logged song. Preview URLs expire, so the
 * app asks every time it replays. CONTRACT: frozen.
 */
export const preview = action({
  args: { deezerId: v.number() },
  returns: v.object({ previewUrl: v.union(v.string(), v.null()) }),
  handler: async (ctx, { deezerId }): Promise<{ previewUrl: string | null }> => {
    if (!Number.isFinite(deezerId)) return { previewUrl: null };
    const names: { artist: string; title: string; itunesTrackId?: number } | null = await ctx.runQuery(
      internal.tracks.lookup,
      { deezerId },
    );
    // Deezer needs only the id, so a song the server has never seen can still resolve there.
    const found = await freshPreview({ deezerId, artist: '', title: '', ...names });
    return { previewUrl: found?.url ?? null };
  },
});
