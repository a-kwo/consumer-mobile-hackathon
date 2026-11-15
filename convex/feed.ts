import { v } from 'convex/values';

import type { Doc } from './_generated/dataModel';
import { type QueryCtx, query } from './_generated/server';
import { summarizeMoods, toOstEntry } from './lib/ost';
import { type FeedItem, feedItemV } from './lib/validators';
import { TUNING } from './tuning';

/**
 * Profiles that may appear in a feed: the seeded friends, then everyone else
 * except cloud test devices, whose deviceIds start with `sim-`. The index is
 * ordered by deviceId, so a prefix is one range and "not that prefix" is the
 * ranges on either side of it. Seeded friends are read first so a crowd of real
 * devices can never push them out of the bound.
 */
async function feedProfiles(ctx: QueryCtx): Promise<Doc<'profiles'>[]> {
  const { testDevicePrefix, seedDevicePrefix, maxProfiles } = TUNING.feed;
  const [seeded, before, after] = await Promise.all([
    ctx.db
      .query('profiles')
      .withIndex('by_deviceId', (q) => q.gte('deviceId', seedDevicePrefix).lt('deviceId', `${seedDevicePrefix}\uffff`))
      .take(maxProfiles),
    ctx.db
      .query('profiles')
      .withIndex('by_deviceId', (q) => q.lt('deviceId', testDevicePrefix))
      .take(maxProfiles),
    ctx.db
      .query('profiles')
      .withIndex('by_deviceId', (q) => q.gt('deviceId', `${testDevicePrefix}\uffff`))
      .take(maxProfiles),
  ]);
  const seen = new Set<string>();
  return [...seeded, ...before, ...after].filter((profile) => {
    if (seen.has(profile._id)) return false;
    seen.add(profile._id);
    return true;
  });
}

/** Recent soundtracks from other profiles, newest first. */
export const list = query({
  args: { deviceId: v.string() },
  returns: v.array(feedItemV),
  handler: async (ctx, { deviceId }) => {
    const { windowMs, maxPerProfile, maxProfiles, testDevicePrefix } = TUNING.feed;
    // The window only needs to be roughly right, and every new play re-runs this query.
    const since = Date.now() - windowMs;
    const profiles = (await feedProfiles(ctx)).filter(
      (profile) =>
        profile.deviceId !== deviceId && (profile.seeded || !profile.deviceId.startsWith(testDevicePrefix)),
    );

    const items = await Promise.all(
      profiles.map(async (profile): Promise<FeedItem | null> => {
        const plays = await ctx.db
          .query('plays')
          .withIndex('by_device_startedAt', (q) => q.eq('deviceId', profile.deviceId).gte('startedAt', since))
          .order('desc')
          .filter((q) => q.eq(q.field('skipped'), false))
          .take(maxPerProfile);
        if (plays.length === 0) return null;
        const entries = plays.reverse().map(toOstEntry);
        return {
          profile: {
            deviceId: profile.deviceId,
            displayName: profile.displayName,
            avatarEmoji: profile.avatarEmoji,
          },
          entries,
          ...summarizeMoods(entries),
          latestAt: entries[entries.length - 1].startedAt,
        };
      }),
    );

    return items
      .filter((item): item is FeedItem => item !== null)
      .sort((a, b) => b.latestAt - a.latestAt)
      .slice(0, maxProfiles);
  },
});
