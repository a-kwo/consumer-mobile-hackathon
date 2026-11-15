/**
 * Seeded friends: three fake people whose soundtracks grow through the day, so
 * the feed is never empty. Their songs are picked by the same matching code as
 * `next:pick`; only the preview fetch is skipped.
 *
 * `seed:friends` is safe to run at any time and as often as you like. It never
 * duplicates a profile and it only ever appends plays, so a feed someone is
 * looking at never reshuffles. With an empty library it does nothing.
 *
 *   npx convex run seed:friends
 */
import { v } from 'convex/values';

import { internal } from './_generated/api';
import { internalAction, internalMutation } from './_generated/server';
import { hashString, seededRandom } from './lib/hash';
import { pickOrder, reasonFor } from './lib/match';
import { buildScene, normalizeHour } from './lib/scene';
import { type PlayContext, type Setting, type Weather, playContextV } from './lib/validators';
import { findCandidates } from './match';
import { type NewPlay, recordPlay } from './plays';
import { TUNING } from './tuning';

type Activity = {
  /** Steps per minute, lowest and highest. [0, 0] is sitting still. */
  cadence: readonly [number, number];
  /** `indoors` reads "at home" in the scene label, so a named place elsewhere uses `any`. */
  setting: Setting;
  weather: Weather;
  /** Where it happens, for the entry title. Empty: the title falls back to the setting. */
  places: readonly string[];
};

type Persona = {
  deviceId: string;
  displayName: string;
  avatarEmoji: string;
  /** The friend's day in local hours. Hours no block covers are spent asleep. */
  day: readonly { from: number; to: number; activity: Activity }[];
};

const STILL = [0, 0] as const;

/** deviceIds must start with TUNING.feed.seedDevicePrefix. */
const PERSONAS: readonly Persona[] = [
  {
    // A night owl who walks in the rain.
    deviceId: 'seed-mira',
    displayName: 'Mira',
    avatarEmoji: '🌙',
    day: [
      { from: 0, to: 2.5, activity: { cadence: [68, 84], setting: 'city', weather: 'rain', places: ['Valencia Street', '24th Street', 'the Mission'] } },
      { from: 11, to: 15, activity: { cadence: STILL, setting: 'indoors', weather: 'rain', places: [] } },
      { from: 15, to: 18.5, activity: { cadence: STILL, setting: 'any', weather: 'cloudy', places: ['the studio'] } },
      { from: 18.5, to: 20, activity: { cadence: STILL, setting: 'transit', weather: 'rain', places: [] } },
      { from: 20, to: 24, activity: { cadence: [90, 104], setting: 'city', weather: 'rain', places: ['Valencia Street', 'Mission Street', 'the Mission'] } },
    ],
  },
  {
    // A morning runner.
    deviceId: 'seed-theo',
    displayName: 'Theo',
    avatarEmoji: '🌅',
    day: [
      { from: 5.5, to: 7.5, activity: { cadence: [158, 172], setting: 'nature', weather: 'clear', places: ['the park', 'Golden Gate Park', 'the Panhandle'] } },
      { from: 7.5, to: 9, activity: { cadence: [112, 124], setting: 'city', weather: 'clear', places: ['Haight Street', 'Cole Valley'] } },
      { from: 9, to: 12, activity: { cadence: STILL, setting: 'any', weather: 'clear', places: ['the office'] } },
      { from: 12, to: 13.5, activity: { cadence: [94, 108], setting: 'nature', weather: 'clear', places: ['the Panhandle', 'Alamo Square'] } },
      { from: 13.5, to: 17.5, activity: { cadence: STILL, setting: 'any', weather: 'cloudy', places: ['the office'] } },
      { from: 17.5, to: 19, activity: { cadence: [146, 160], setting: 'gym', weather: 'cloudy', places: [] } },
      { from: 19, to: 21.5, activity: { cadence: STILL, setting: 'indoors', weather: 'clear', places: [] } },
    ],
  },
  {
    // Cafés and commutes.
    deviceId: 'seed-june',
    displayName: 'June',
    avatarEmoji: '☕',
    day: [
      { from: 7, to: 8.5, activity: { cadence: STILL, setting: 'transit', weather: 'fog', places: [] } },
      { from: 8.5, to: 9.5, activity: { cadence: [100, 112], setting: 'city', weather: 'fog', places: ['Market Street', 'Hayes Valley'] } },
      { from: 9.5, to: 12, activity: { cadence: STILL, setting: 'any', weather: 'cloudy', places: ['the café'] } },
      { from: 12, to: 13.5, activity: { cadence: [72, 88], setting: 'city', weather: 'clear', places: ['Hayes Valley', 'Octavia Street'] } },
      { from: 13.5, to: 17, activity: { cadence: STILL, setting: 'any', weather: 'clear', places: ['the café', 'the library'] } },
      { from: 17, to: 18.5, activity: { cadence: STILL, setting: 'transit', weather: 'cloudy', places: [] } },
      { from: 18.5, to: 20, activity: { cadence: [94, 106], setting: 'city', weather: 'cloudy', places: ['Divisadero Street', 'the Lower Haight'] } },
      { from: 20, to: 22.5, activity: { cadence: STILL, setting: 'indoors', weather: 'cloudy', places: [] } },
    ],
  },
];

const HOUR_MS = 60 * 60 * 1000;

/** The friends' local hour of day at a moment in time. */
const localHourAt = (at: number) => normalizeHour(at / HOUR_MS + TUNING.seedUtcOffsetHours);

function activityAt(persona: Persona, at: number): Activity | null {
  const hour = localHourAt(at);
  return persona.day.find((block) => hour >= block.from && hour < block.to)?.activity ?? null;
}

type Slot = { startedAt: number; context: PlayContext };

function slotAt(at: number, activity: Activity, random: () => number): Slot {
  const [low, high] = activity.cadence;
  const place = activity.places[Math.floor(random() * activity.places.length)];
  return {
    startedAt: Math.round(at),
    context: {
      cadenceSpm: Math.round(low + random() * (high - low)),
      weather: activity.weather,
      localHour: localHourAt(at),
      setting: activity.setting,
      simulated: false,
      ...(place ? { placeName: place } : {}),
    },
  };
}

/**
 * The moments a friend should get a play for, oldest first.
 *
 * A friend with no plays inside the backfill window gets a day's worth: the most
 * recent waking moments, walking back from now. Otherwise at most one, and only
 * when their latest play is older than `seedMinGapMs` and they are awake.
 */
function planSlots(persona: Persona, latestAt: number | null, now: number): Slot[] {
  const random = seededRandom(hashString(`${persona.deviceId}:${Math.floor(now / HOUR_MS)}`));
  const newest = now - random() * TUNING.seedJitterMs;

  if (latestAt !== null && now - latestAt <= TUNING.seedBackfillWindowMs) {
    if (now - latestAt < TUNING.seedMinGapMs) return [];
    const activity = activityAt(persona, newest);
    return activity ? [slotAt(newest, activity, random)] : [];
  }

  const { min, max } = TUNING.seedBackfillGapMs;
  const slots: Slot[] = [];
  for (let at = newest; at > now - TUNING.seedBackfillWindowMs; at -= min + random() * (max - min)) {
    const activity = activityAt(persona, at);
    if (activity) slots.push(slotAt(at, activity, random));
    if (slots.length >= TUNING.seedBackfillPlays) break;
  }
  return slots.reverse();
}

const isSeedDevice = (deviceId: string) => PERSONAS.some((persona) => persona.deviceId === deviceId);

/**
 * Creates the missing friend profiles and reports each friend's latest play.
 * Returns null, and creates nothing, while the library is empty.
 */
export const begin = internalMutation({
  args: {},
  returns: v.union(v.null(), v.array(v.object({ deviceId: v.string(), latestAt: v.union(v.number(), v.null()) }))),
  handler: async (ctx) => {
    if (!(await ctx.db.query('songs').first())) return null;
    return await Promise.all(
      PERSONAS.map(async ({ deviceId, displayName, avatarEmoji }) => {
        const [profile, latest] = await Promise.all([
          ctx.db
            .query('profiles')
            .withIndex('by_deviceId', (q) => q.eq('deviceId', deviceId))
            .first(),
          ctx.db
            .query('plays')
            .withIndex('by_device_startedAt', (q) => q.eq('deviceId', deviceId))
            .order('desc')
            .first(),
        ]);
        if (!profile) await ctx.db.insert('profiles', { deviceId, displayName, avatarEmoji, seeded: true });
        return { deviceId, latestAt: latest?.startedAt ?? null };
      }),
    );
  },
});

/**
 * Appends plays to a friend's log. Append-only: a play is kept only when it is
 * at least `seedMinGapMs` newer than everything the friend already has, which
 * also makes two overlapping seeder runs harmless.
 */
export const append = internalMutation({
  args: {
    deviceId: v.string(),
    plays: v.array(
      v.object({
        deezerId: v.number(),
        startedAt: v.number(),
        context: playContextV,
        sceneKey: v.string(),
        sceneLabel: v.string(),
        reason: v.string(),
      }),
    ),
  },
  returns: v.number(),
  handler: async (ctx, { deviceId, plays }) => {
    if (!isSeedDevice(deviceId)) throw new Error(`${deviceId} is not a seeded friend`);
    const latest = await ctx.db
      .query('plays')
      .withIndex('by_device_startedAt', (q) => q.eq('deviceId', deviceId))
      .order('desc')
      .first();
    const earliest = latest ? latest.startedAt + TUNING.seedMinGapMs : -Infinity;
    let added = 0;
    for (const play of [...plays].sort((a, b) => a.startedAt - b.startedAt)) {
      if (play.startedAt < earliest) continue;
      if (await recordPlay(ctx, { deviceId, ...play })) added += 1;
    }
    return added;
  },
});

/** Deletes seeded friends' plays from before `before`, a bounded batch per friend. */
export const prune = internalMutation({
  args: { before: v.number() },
  returns: v.number(),
  handler: async (ctx, { before }) => {
    const batches = await Promise.all(
      PERSONAS.map(({ deviceId }) =>
        ctx.db
          .query('plays')
          .withIndex('by_device_startedAt', (q) => q.eq('deviceId', deviceId).lt('startedAt', before))
          .take(200),
      ),
    );
    const old = batches.flat();
    await Promise.all(old.map((play) => ctx.db.delete('plays', play._id)));
    return old.length;
  },
});

/**
 * Deletes every play of the seeded friends, so the next `seed:friends` gives
 * them a fresh day from the current library. A manual tool for demo prep (for
 * example after importing the real library): it does reshuffle the feed.
 */
export const reset = internalMutation({
  args: {},
  returns: v.object({ deleted: v.number(), more: v.boolean() }),
  handler: async (ctx) => {
    const limit = 400;
    const batches = await Promise.all(
      PERSONAS.map(({ deviceId }) =>
        ctx.db
          .query('plays')
          .withIndex('by_device_startedAt', (q) => q.eq('deviceId', deviceId))
          .take(limit),
      ),
    );
    const plays = batches.flat();
    await Promise.all(plays.map((play) => ctx.db.delete('plays', play._id)));
    return { deleted: plays.length, more: batches.some((batch) => batch.length === limit) };
  },
});

/**
 * Creates the three friends if they are missing, appends whatever plays they
 * are due and prunes their plays older than `seedPruneMs`. Run hourly by the
 * cron in crons.ts, and by hand after importing a library.
 */
export const friends = internalAction({
  args: {},
  returns: v.object({ seeded: v.boolean(), added: v.number(), pruned: v.number() }),
  handler: async (ctx): Promise<{ seeded: boolean; added: number; pruned: number }> => {
    const now = Date.now();
    const state: { deviceId: string; latestAt: number | null }[] | null = await ctx.runMutation(
      internal.seed.begin,
      {},
    );
    if (!state) return { seeded: false, added: 0, pruned: 0 };

    const added: number[] = await Promise.all(
      PERSONAS.map(async (persona) => {
        const latestAt = state.find((friend) => friend.deviceId === persona.deviceId)?.latestAt ?? null;
        const plays: Omit<NewPlay, 'deviceId'>[] = [];
        // Songs chosen in this run are not in the play log yet, so exclude them by hand.
        const chosen: number[] = [];
        for (const { startedAt, context } of planSlots(persona, latestAt, now)) {
          const scene = buildScene({
            cadenceSpm: context.cadenceSpm,
            localHour: context.localHour,
            weather: context.weather,
            setting: context.setting,
          });
          const found = await findCandidates(ctx, {
            deviceId: persona.deviceId,
            scene,
            excludeDeezerIds: chosen,
          });
          const [song] = pickOrder(found.ranked, Math.random(), 1);
          if (!song) continue;
          chosen.push(song.deezerId);
          plays.push({
            deezerId: song.deezerId,
            startedAt,
            context,
            sceneKey: scene.key,
            sceneLabel: scene.label,
            reason: reasonFor(song, scene),
          });
        }
        if (plays.length === 0) return 0;
        return await ctx.runMutation(internal.seed.append, { deviceId: persona.deviceId, plays });
      }),
    );

    const pruned: number = await ctx.runMutation(internal.seed.prune, { before: now - TUNING.seedPruneMs });
    return { seeded: true, added: added.reduce((sum, count) => sum + count, 0), pruned };
  },
});
