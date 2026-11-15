import { v } from 'convex/values';

import type { Doc } from './_generated/dataModel';
import { type QueryCtx, query } from './_generated/server';
import { publicTitle, summarizeMoods, toOstEntry } from './lib/ost';
import { type FeedItem, feedItemV } from './lib/validators';
import { loadPhotos } from './ost';
import { TUNING } from './tuning';

/**
 * Profiles that may appear in a feed: the seeded friends, then everyone else
 * except cloud test devices, whose deviceIds start with `sim-`. The index is
 * ordered by deviceId, so a prefix is one range and "not that prefix" is the
 * ranges on either side of it. Seeded friends are read first so a crowd of real
 * devices can never push them out of the bound.
 */
async function feedProfiles(ctx: QueryCtx): Promise<Doc<'profiles'>[]> {
  const { testDevicePrefix, seedDevicePrefix, maxProfiles, profileReadLimit } = TUNING.feed;
  const [seeded, before, after] = await Promise.all([
    ctx.db
      .query('profiles')
      .withIndex('by_deviceId', (q) => q.gte('deviceId', seedDevicePrefix).lt('deviceId', `${seedDevicePrefix}\uffff`))
      .take(maxProfiles),
    ctx.db
      .query('profiles')
      .withIndex('by_deviceId', (q) => q.lt('deviceId', testDevicePrefix))
      .take(profileReadLimit),
    ctx.db
      .query('profiles')
      .withIndex('by_deviceId', (q) => q.gt('deviceId', `${testDevicePrefix}\uffff`))
      .take(profileReadLimit),
  ]);
  const seen = new Set<string>();
  return [...seeded, ...before, ...after].filter((profile) => {
    if (seen.has(profile._id)) return false;
    seen.add(profile._id);
    return true;
  });
}

/**
 * Recent soundtracks from other profiles, newest first. A day its owner made
 * private never appears; a day with no `osts` row is visible to friends.
 */
export const list = query({
  args: { deviceId: v.string() },
  returns: v.array(feedItemV),
  handler: async (ctx, { deviceId }) => {
    const { windowMs, maxPerProfile, maxProfiles, testDevicePrefix } = TUNING.feed;
    // The window only needs to be roughly right, and every new play re-runs this query.
    if (deviceId.length > TUNING.maxDeviceIdChars) return [];
    const since = Date.now() - windowMs;
    const profiles = (await feedProfiles(ctx)).filter(
      (profile) =>
        profile.deviceId !== deviceId && (profile.seeded || !profile.deviceId.startsWith(testDevicePrefix)),
    );

    const items = await Promise.all(
      profiles.map(async (profile): Promise<FeedItem | null> => {
        const [recent, osts] = await Promise.all([
          ctx.db
            .query('plays')
            .withIndex('by_device_startedAt', (q) => q.eq('deviceId', profile.deviceId).gte('startedAt', since))
            .order('desc')
            .filter((q) => q.eq(q.field('skipped'), false))
            .take(maxPerProfile),
          // Every day that can overlap the window: a day is at most `dayMs.max` long.
          ctx.db
            .query('osts')
            .withIndex('by_device_dayStart', (q) =>
              q.eq('deviceId', profile.deviceId).gt('dayStart', since - TUNING.share.dayMs.max),
            )
            .take(4),
        ]);
        const ostFor = (play: Doc<'plays'>) =>
          osts.find((ost) => play.startedAt >= ost.dayStart && play.startedAt < ost.dayEnd);
        const plays = recent.reverse().filter((play) => ostFor(play)?.visibility !== 'private');
        if (plays.length === 0) return null;

        // The days the visible plays fall on, oldest first, each with its photos.
        const days = await Promise.all(
          osts
            .filter((ost) => plays.some((play) => ostFor(play) === ost))
            .sort((a, b) => a.dayStart - b.dayStart)
            .map(async (ost) => ({ ost, photos: await loadPhotos(ctx, ost._id) })),
        );
        const photos = days.flatMap((day) => day.photos);
        const photoByPlay = new Map(photos.flatMap((photo) => (photo.playId ? [[photo.playId, photo.url] as const] : [])));
        const title = ostFor(plays[plays.length - 1])?.title;
        const leadPhotoUrl = [...days].reverse().find((day) => day.photos.length > 0)?.photos[0].url;

        const entries = plays.map((play) => {
          const photoUrl = photoByPlay.get(play._id);
          return {
            ...toOstEntry(play),
            ...(ostFor(play)?.hideLocations ? { title: publicTitle(play) } : {}),
            ...(photoUrl ? { photoUrl } : {}),
          };
        });
        return {
          profile: {
            // A deviceId is its owner's only credential, so it is never published.
            // The profile's own id stands in: stable, unique, and useless for writing.
            deviceId: profile._id,
            displayName: profile.displayName,
            avatarEmoji: profile.avatarEmoji,
          },
          entries,
          ...summarizeMoods(entries),
          latestAt: entries[entries.length - 1].startedAt,
          ...(title ? { title } : {}),
          ...(leadPhotoUrl ? { leadPhotoUrl } : {}),
          ...(photos.length > 0 ? { photoUrls: photos.map((photo) => photo.url) } : {}),
        };
      }),
    );

    return items
      .filter((item): item is FeedItem => item !== null)
      .sort((a, b) => b.latestAt - a.latestAt)
      .slice(0, maxProfiles);
  },
});
