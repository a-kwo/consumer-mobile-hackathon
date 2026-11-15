import { v } from 'convex/values';

import { query } from './_generated/server';
import { summarizeMoods, toOstEntry } from './lib/ost';
import { ostV } from './lib/validators';
import { TUNING } from './tuning';

/** A device's soundtrack for one local day. The client passes its own day boundaries. */
export const get = query({
  args: { deviceId: v.string(), dayStart: v.number(), dayEnd: v.number() },
  returns: ostV,
  handler: async (ctx, { deviceId, dayStart, dayEnd }) => {
    if (!(dayStart < dayEnd) || deviceId.length > TUNING.maxDeviceIdChars) return { entries: [], topMoods: [], summary: '' };
    // Newest first so the bound keeps the latest plays, then flipped to play order.
    const plays = await ctx.db
      .query('plays')
      .withIndex('by_device_startedAt', (q) =>
        q.eq('deviceId', deviceId).gte('startedAt', dayStart).lt('startedAt', dayEnd),
      )
      .order('desc')
      .filter((q) => q.eq(q.field('skipped'), false))
      .take(TUNING.ostMaxEntries);
    const entries = plays.reverse().map(toOstEntry);
    return { entries, ...summarizeMoods(entries) };
  },
});
