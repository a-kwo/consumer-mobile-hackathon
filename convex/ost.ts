import { v } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import { type MutationCtx, type QueryCtx, mutation, query } from './_generated/server';
import { requireClientDeviceId } from './lib/device';
import { type LocalDay, cleanOstTitle, isLocalDay, publicTitle, summarizeMoods, toOstEntry } from './lib/ost';
import { type OstPhoto, ostV, visibilityV } from './lib/validators';
import { TUNING } from './tuning';

/** The local day a phone is editing. The server knows no timezones, so the phone sends its own midnights. */
export const localDayArgs = { date: v.string(), dayStart: v.number(), dayEnd: v.number() };

/**
 * The device's `osts` row for a day, created as a friends-visible, untitled
 * soundtrack when this is the first edit of that day. Throws for a day no
 * phone could mean. Shared by `ost:update`, `photos:attach` and the seeded friends.
 */
export async function ensureOst(ctx: MutationCtx, deviceId: string, day: LocalDay): Promise<Doc<'osts'>> {
  if (!isLocalDay(day)) throw new Error('invalid day');
  const existing = await ctx.db
    .query('osts')
    .withIndex('by_device_date', (q) => q.eq('deviceId', deviceId).eq('date', day.date))
    .first();
  if (existing) {
    // The same date after a timezone change: the newest midnights win.
    if (existing.dayStart !== day.dayStart || existing.dayEnd !== day.dayEnd) {
      await ctx.db.patch('osts', existing._id, { dayStart: day.dayStart, dayEnd: day.dayEnd });
    }
    return { ...existing, dayStart: day.dayStart, dayEnd: day.dayEnd };
  }
  const id = await ctx.db.insert('osts', {
    deviceId,
    date: day.date,
    dayStart: day.dayStart,
    dayEnd: day.dayEnd,
    visibility: 'friends',
    hideLocations: false,
  });
  const created = await ctx.db.get('osts', id);
  if (!created) throw new Error(`ost ${id} vanished inside its own transaction`);
  return created;
}

/** A soundtrack's photos with their URLs, oldest first. Photos whose file is gone are left out. */
export async function loadPhotos(ctx: QueryCtx, ostId: Id<'osts'>): Promise<OstPhoto[]> {
  const rows = await ctx.db
    .query('photos')
    .withIndex('by_ost', (q) => q.eq('ostId', ostId))
    .take(TUNING.share.maxPhotosPerOst);
  const photos = await Promise.all(
    rows.map(async (row): Promise<OstPhoto | null> => {
      const url = await ctx.storage.getUrl(row.storageId);
      if (!url) return null;
      return { photoId: row._id, url, takenAt: row.takenAt, ...(row.playId ? { playId: row.playId } : {}) };
    }),
  );
  return photos.filter((photo): photo is OstPhoto => photo !== null);
}

/** A device's soundtrack for one local day. The client passes its own day boundaries. */
export const get = query({
  args: { deviceId: v.string(), dayStart: v.number(), dayEnd: v.number() },
  returns: ostV,
  handler: async (ctx, { deviceId, dayStart, dayEnd }) => {
    if (!(dayStart < dayEnd) || deviceId.length > TUNING.maxDeviceIdChars) return { entries: [], topMoods: [], summary: '' };
    // Newest first so the bound keeps the latest plays, then flipped to play order.
    const [plays, ost] = await Promise.all([
      ctx.db
        .query('plays')
        .withIndex('by_device_startedAt', (q) =>
          q.eq('deviceId', deviceId).gte('startedAt', dayStart).lt('startedAt', dayEnd),
        )
        .order('desc')
        .filter((q) => q.eq(q.field('skipped'), false))
        .take(TUNING.ostMaxEntries),
      ctx.db
        .query('osts')
        .withIndex('by_device_dayStart', (q) => q.eq('deviceId', deviceId).eq('dayStart', dayStart))
        .first(),
    ]);
    plays.reverse();
    if (!ost) {
      const entries = plays.map(toOstEntry);
      return { entries, ...summarizeMoods(entries) };
    }

    const photos = await loadPhotos(ctx, ost._id);
    const photoByPlay = new Map(photos.flatMap((photo) => (photo.playId ? [[photo.playId, photo.url] as const] : [])));
    const entries = plays.map((play) => {
      const photoUrl = photoByPlay.get(play._id);
      const shared = ost.hideLocations ? publicTitle(play) : play.title;
      return {
        ...toOstEntry(play),
        ...(photoUrl ? { photoUrl } : {}),
        ...(shared !== play.title ? { publicTitle: shared } : {}),
      };
    });
    return {
      entries,
      ...summarizeMoods(entries),
      ...(ost.title ? { title: ost.title } : {}),
      visibility: ost.visibility,
      hideLocations: ost.hideLocations,
      photos,
    };
  },
});

/**
 * Sets a day's title, who may see it and whether its places are hidden. Only
 * what is passed changes; an empty title goes back to the date. Creates the
 * day's row on first use, and only ever touches the caller's own.
 */
export const update = mutation({
  args: {
    deviceId: v.string(),
    ...localDayArgs,
    title: v.optional(v.string()),
    visibility: v.optional(visibilityV),
    hideLocations: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, { deviceId, date, dayStart, dayEnd, title, visibility, hideLocations }) => {
    requireClientDeviceId(deviceId);
    // Looked up by the caller's own deviceId, so the row is the caller's by construction.
    const ost = await ensureOst(ctx, deviceId, { date, dayStart, dayEnd });
    await ctx.db.patch('osts', ost._id, {
      ...(title !== undefined ? { title: cleanOstTitle(title) ?? undefined } : {}),
      ...(visibility !== undefined ? { visibility } : {}),
      ...(hideLocations !== undefined ? { hideLocations } : {}),
    });
    return null;
  },
});
