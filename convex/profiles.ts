import { v } from 'convex/values';

import type { Doc } from './_generated/dataModel';
import { type MutationCtx, type QueryCtx, mutation, query } from './_generated/server';
import { cleanDisplayName, firstEmoji, generatedProfile } from './lib/names';
import { type Profile, profileV } from './lib/validators';

const findProfile = (ctx: QueryCtx, deviceId: string) =>
  ctx.db
    .query('profiles')
    .withIndex('by_deviceId', (q) => q.eq('deviceId', deviceId))
    .first();

const toProfile = (row: Doc<'profiles'>): Profile => ({
  deviceId: row.deviceId,
  displayName: row.displayName,
  avatarEmoji: row.avatarEmoji,
});

/** The device's profile row, created with a generated name and emoji on first use. */
async function ensureProfile(ctx: MutationCtx, deviceId: string): Promise<Doc<'profiles'>> {
  const existing = await findProfile(ctx, deviceId);
  if (existing) return existing;
  const id = await ctx.db.insert('profiles', { deviceId, ...generatedProfile(deviceId), seeded: false });
  const created = await ctx.db.get('profiles', id);
  if (!created) throw new Error(`profile ${id} vanished inside its own transaction`);
  return created;
}

/** Returns the device's profile, creating one with a generated name and emoji on first use. CONTRACT: frozen. */
export const ensure = mutation({
  args: { deviceId: v.string() },
  returns: profileV,
  handler: async (ctx, { deviceId }) => toProfile(await ensureProfile(ctx, deviceId)),
});

/**
 * Renames the profile or changes its emoji. The name is trimmed and cut to 24
 * characters and the avatar to its first emoji; input with nothing usable in it
 * leaves that field as it was. CONTRACT: frozen.
 */
export const update = mutation({
  args: {
    deviceId: v.string(),
    displayName: v.optional(v.string()),
    avatarEmoji: v.optional(v.string()),
  },
  returns: profileV,
  handler: async (ctx, { deviceId, displayName, avatarEmoji }) => {
    const row = await ensureProfile(ctx, deviceId);
    const next = {
      displayName: (displayName !== undefined ? cleanDisplayName(displayName) : null) ?? row.displayName,
      avatarEmoji: (avatarEmoji !== undefined ? firstEmoji(avatarEmoji) : null) ?? row.avatarEmoji,
    };
    if (next.displayName !== row.displayName || next.avatarEmoji !== row.avatarEmoji) {
      await ctx.db.patch('profiles', row._id, next);
    }
    return { deviceId, ...next };
  },
});

/** CONTRACT: frozen. */
export const get = query({
  args: { deviceId: v.string() },
  returns: v.union(profileV, v.null()),
  handler: async (ctx, { deviceId }) => {
    const row = await findProfile(ctx, deviceId);
    return row ? toProfile(row) : null;
  },
});
