/**
 * Photos on a soundtrack, kept in Convex file storage. The phone asks for an
 * upload URL, posts the resized image to it and then attaches the stored file
 * to a day; a photo taken during a cue lands on that cue.
 *
 * A deviceId is the only credential there is, so "yours" means "the row
 * carries the deviceId you sent". That keeps devices out of each other's
 * soundtracks; it is not real security.
 */
import { v } from 'convex/values';

import { mutation } from './_generated/server';
import { requireClientDeviceId } from './lib/device';
import { cueAt } from './lib/ost';
import { ensureOst, localDayArgs } from './ost';
import { TUNING } from './tuning';

/** A short-lived URL to POST one image to. The response body is `{ storageId }`. */
export const uploadUrl = mutation({
  args: { deviceId: v.string() },
  returns: v.string(),
  handler: async (ctx, { deviceId }) => {
    requireClientDeviceId(deviceId);
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Attaches an uploaded image to the caller's soundtrack for a day, creating
 * the day's row on first use, and links it to the cue that was playing at
 * `takenAt` when there is one. A file that is not an image, is too large or
 * would take the soundtrack past its cap is deleted and the reason returned.
 */
export const attach = mutation({
  args: { deviceId: v.string(), ...localDayArgs, storageId: v.id('_storage'), takenAt: v.number() },
  returns: v.union(
    v.object({ ok: v.literal(true), photoId: v.id('photos'), playId: v.optional(v.id('plays')) }),
    v.object({ ok: v.literal(false), reason: v.union(v.literal('not_image'), v.literal('too_large'), v.literal('too_many')) }),
  ),
  handler: async (ctx, { deviceId, date, dayStart, dayEnd, storageId, takenAt }) => {
    requireClientDeviceId(deviceId);
    if (!Number.isFinite(takenAt)) throw new Error('invalid takenAt');
    const [file, claimed] = await Promise.all([
      ctx.db.system.get('_storage', storageId),
      ctx.db
        .query('photos')
        .withIndex('by_storageId', (q) => q.eq('storageId', storageId))
        .first(),
    ]);
    // A file can belong to one photo only, or removing one photo would delete another's image.
    if (!file || claimed) throw new Error('unknown upload');

    // Looked up by the caller's own deviceId, so the soundtrack is the caller's by construction.
    const ost = await ensureOst(ctx, deviceId, { date, dayStart, dayEnd });
    const [existing, plays] = await Promise.all([
      ctx.db
        .query('photos')
        .withIndex('by_ost', (q) => q.eq('ostId', ost._id))
        .take(TUNING.share.maxPhotosPerOst),
      // A photo from outside the day belongs to no cue of it.
      takenAt < dayStart || takenAt >= dayEnd
        ? []
        : ctx.db
            .query('plays')
            .withIndex('by_device_startedAt', (q) =>
              q
                .eq('deviceId', deviceId)
                .gte('startedAt', Math.max(dayStart, takenAt - TUNING.share.photoCueWindowMs))
                .lte('startedAt', takenAt),
            )
            .order('desc')
            .filter((q) => q.neq(q.field('hidden'), true))
            .take(1),
    ]);

    let refused: 'not_image' | 'too_large' | 'too_many' | null = null;
    if (!file.contentType?.startsWith('image/')) refused = 'not_image';
    else if (file.size > TUNING.share.maxPhotoBytes) refused = 'too_large';
    else if (existing.length >= TUNING.share.maxPhotosPerOst) refused = 'too_many';
    if (refused) {
      // Returned, not thrown: a throw would roll the delete back and strand the file.
      await ctx.storage.delete(storageId);
      return { ok: false as const, reason: refused };
    }

    const play = cueAt(plays, takenAt);
    const photoId = await ctx.db.insert('photos', {
      ostId: ost._id,
      storageId,
      takenAt,
      ...(play ? { playId: play._id } : {}),
    });
    return { ok: true as const, photoId, ...(play ? { playId: play._id } : {}) };
  },
});

/** Removes one of the caller's photos and deletes its stored file. A photo that is already gone is not an error. */
export const remove = mutation({
  args: { deviceId: v.string(), photoId: v.id('photos') },
  returns: v.null(),
  handler: async (ctx, { deviceId, photoId }) => {
    requireClientDeviceId(deviceId);
    const photo = await ctx.db.get('photos', photoId);
    if (!photo) return null;
    const ost = await ctx.db.get('osts', photo.ostId);
    if (!ost || ost.deviceId !== deviceId) throw new Error('not your photo');
    await ctx.storage.delete(photo.storageId);
    await ctx.db.delete('photos', photoId);
    return null;
  },
});
