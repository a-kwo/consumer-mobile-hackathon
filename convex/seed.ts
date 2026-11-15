/**
 * Seeded friends: six fake people in six cities whose soundtracks grow through
 * the day, so the feed and the friends map are never empty. Their songs are picked by the same matching code as
 * `next:pick`; only the preview fetch is skipped.
 *
 * `seed:friends` is safe to run at any time and as often as you like. It never
 * duplicates a profile and it only ever appends plays, so a feed someone is
 * looking at never reshuffles. With an empty library it does nothing.
 *
 * Friends also title their days, and two of them add a "photo": an image drawn
 * in code (lib/bokeh.ts), so the photo layout shows on a device with an empty
 * camera roll.
 *
 *   npx convex run seed:friends
 */
import { v } from 'convex/values';

import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { type MutationCtx, internalAction, internalMutation } from './_generated/server';
import { BOKEH_PALETTES, type BokehPaletteName, bokehPng } from './lib/bokeh';
import { hashString, seededRandom } from './lib/hash';
import { pickOrder, reasonFor } from './lib/match';
import { buildScene, normalizeHour } from './lib/scene';
import { type PlayContext, type Setting, type Weather, playContextV } from './lib/validators';
import { findCandidates } from './match';
import { ensureOst } from './ost';
import { type NewPlay, recordPlay } from './plays';
import { TUNING } from './tuning';

type Activity = {
  /** Steps per minute, lowest and highest. [0, 0] is sitting still. */
  cadence: readonly [number, number];
  /** `indoors` reads "at home" in the scene label, so a named place elsewhere uses `any`. */
  setting: Setting;
  weather: Weather;
  /** Where it happens, for the entry title. Empty: the title falls back to the setting, and the play is at home. */
  places: readonly string[];
};

type Persona = {
  deviceId: string;
  displayName: string;
  avatarEmoji: string;
  /** Where the friend lives: the label and centre of their dot on the map, and their clock. */
  home: { city: string; lat: number; lon: number; utcOffsetHours: number };
  /** The friend's day in local hours. Hours no block covers are spent asleep. */
  day: readonly { from: number; to: number; activity: Activity }[];
  /** What the friend calls their days. Absent: the soundtrack shows its date. */
  ostTitle?: string;
  /** The generated lead image the friend adds to each day. Absent: the cover mosaic leads. */
  photo?: BokehPaletteName;
};

const STILL = [0, 0] as const;

/**
 * Six friends in six cities, so the map has someone awake at most hours.
 * deviceIds must start with TUNING.feed.seedDevicePrefix. Offsets are the
 * cities' standard time.
 */
const PERSONAS: readonly Persona[] = [
  {
    // A night owl who walks in the rain.
    deviceId: 'seed-mira',
    displayName: 'Mira',
    avatarEmoji: '🌙',
    home: { city: 'London', lat: 51.5246, lon: -0.0716, utcOffsetHours: 0 },
    ostTitle: 'The long way home',
    photo: 'rainyNight',
    day: [
      { from: 0, to: 2.5, activity: { cadence: [68, 84], setting: 'city', weather: 'rain', places: ['Brick Lane', 'Columbia Road', 'Shoreditch'] } },
      { from: 11, to: 15, activity: { cadence: STILL, setting: 'indoors', weather: 'rain', places: [] } },
      { from: 15, to: 18.5, activity: { cadence: STILL, setting: 'any', weather: 'cloudy', places: ['the studio'] } },
      { from: 18.5, to: 20, activity: { cadence: STILL, setting: 'transit', weather: 'rain', places: [] } },
      { from: 20, to: 24, activity: { cadence: [90, 104], setting: 'city', weather: 'rain', places: ['Brick Lane', 'Bethnal Green Road', 'Shoreditch'] } },
    ],
  },
  {
    // A morning runner.
    deviceId: 'seed-theo',
    displayName: 'Theo',
    avatarEmoji: '🌅',
    home: { city: 'San Francisco', lat: 37.7699, lon: -122.4469, utcOffsetHours: -8 },
    ostTitle: 'First light',
    photo: 'sunrise',
    day: [
      { from: 5.5, to: 7.5, activity: { cadence: [158, 172], setting: 'nature', weather: 'clear', places: ['Golden Gate Park', 'the Panhandle'] } },
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
    home: { city: 'New York', lat: 40.7336, lon: -74.0027, utcOffsetHours: -5 },
    day: [
      { from: 7, to: 8.5, activity: { cadence: STILL, setting: 'transit', weather: 'cloudy', places: [] } },
      { from: 8.5, to: 9.5, activity: { cadence: [100, 112], setting: 'city', weather: 'cloudy', places: ['Bleecker Street', 'the West Village'] } },
      { from: 9.5, to: 12, activity: { cadence: STILL, setting: 'any', weather: 'cloudy', places: ['the café'] } },
      { from: 12, to: 13.5, activity: { cadence: [72, 88], setting: 'city', weather: 'clear', places: ['Washington Square', 'Hudson Street'] } },
      { from: 13.5, to: 17, activity: { cadence: STILL, setting: 'any', weather: 'clear', places: ['the café', 'the library'] } },
      { from: 17, to: 18.5, activity: { cadence: STILL, setting: 'transit', weather: 'cloudy', places: [] } },
      { from: 18.5, to: 20, activity: { cadence: [94, 106], setting: 'city', weather: 'cloudy', places: ['Bleecker Street', 'Hudson Street'] } },
      { from: 20, to: 22.5, activity: { cadence: STILL, setting: 'indoors', weather: 'cloudy', places: [] } },
    ],
  },
  {
    // Trains by day, backstreets and record shops by night.
    deviceId: 'seed-yuki',
    displayName: 'Yuki',
    avatarEmoji: '🎧',
    home: { city: 'Tokyo', lat: 35.6617, lon: 139.668, utcOffsetHours: 9 },
    ostTitle: 'Last train',
    photo: 'rainyNight',
    day: [
      { from: 7.5, to: 9, activity: { cadence: STILL, setting: 'transit', weather: 'clear', places: [] } },
      { from: 9, to: 12.5, activity: { cadence: STILL, setting: 'any', weather: 'clear', places: ['the office'] } },
      { from: 12.5, to: 13.5, activity: { cadence: [96, 108], setting: 'city', weather: 'clear', places: ['Nakameguro', 'Daikanyama'] } },
      { from: 13.5, to: 18.5, activity: { cadence: STILL, setting: 'any', weather: 'cloudy', places: ['the office'] } },
      { from: 18.5, to: 19.5, activity: { cadence: STILL, setting: 'transit', weather: 'rain', places: [] } },
      { from: 19.5, to: 23, activity: { cadence: [82, 100], setting: 'city', weather: 'rain', places: ['Shimokitazawa', 'Shibuya', 'Sangenjaya'] } },
      { from: 23, to: 24, activity: { cadence: STILL, setting: 'indoors', weather: 'rain', places: [] } },
    ],
  },
  {
    // Slow sunny days on the hills above the river.
    deviceId: 'seed-ines',
    displayName: 'Inês',
    avatarEmoji: '🌊',
    home: { city: 'Lisbon', lat: 38.7139, lon: -9.1394, utcOffsetHours: 0 },
    ostTitle: 'Light on the river',
    photo: 'sunrise',
    day: [
      { from: 8, to: 9.5, activity: { cadence: [64, 80], setting: 'city', weather: 'clear', places: ['Alfama', 'Rua Augusta'] } },
      { from: 9.5, to: 12.5, activity: { cadence: STILL, setting: 'any', weather: 'clear', places: ['the café', 'the studio'] } },
      { from: 12.5, to: 14, activity: { cadence: [70, 86], setting: 'nature', weather: 'clear', places: ['Jardim da Estrela'] } },
      { from: 14, to: 17.5, activity: { cadence: STILL, setting: 'any', weather: 'clear', places: ['the studio'] } },
      { from: 17.5, to: 19.5, activity: { cadence: [88, 102], setting: 'city', weather: 'clear', places: ['Príncipe Real', 'Chiado', 'Rua Augusta'] } },
      { from: 19.5, to: 23, activity: { cadence: STILL, setting: 'indoors', weather: 'clear', places: [] } },
    ],
  },
  {
    // Early gym, fast walks, a park at dusk.
    deviceId: 'seed-mateo',
    displayName: 'Mateo',
    avatarEmoji: '🌵',
    home: { city: 'Mexico City', lat: 19.413, lon: -99.167, utcOffsetHours: -6 },
    day: [
      { from: 6, to: 7.5, activity: { cadence: [148, 164], setting: 'gym', weather: 'clear', places: [] } },
      { from: 7.5, to: 9, activity: { cadence: [114, 126], setting: 'city', weather: 'clear', places: ['Roma Norte', 'Avenida Ámsterdam'] } },
      { from: 9, to: 14, activity: { cadence: STILL, setting: 'any', weather: 'clear', places: ['the office'] } },
      { from: 14, to: 15.5, activity: { cadence: [96, 110], setting: 'city', weather: 'cloudy', places: ['Condesa', 'Avenida Ámsterdam'] } },
      { from: 15.5, to: 18.5, activity: { cadence: STILL, setting: 'any', weather: 'cloudy', places: ['the office'] } },
      { from: 18.5, to: 20, activity: { cadence: [150, 166], setting: 'nature', weather: 'clear', places: ['Parque México'] } },
      { from: 20, to: 22.5, activity: { cadence: STILL, setting: 'indoors', weather: 'clear', places: [] } },
    ],
  },
];

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** A friend's local day that contains a moment, in the shape a phone would send. */
function seedDayAt(persona: Persona, at: number) {
  const offset = persona.home.utcOffsetHours * HOUR_MS;
  const dayStart = Math.floor((at + offset) / DAY_MS) * DAY_MS - offset;
  return { date: new Date(dayStart + offset).toISOString().slice(0, 10), dayStart, dayEnd: dayStart + DAY_MS };
}

/** Deletes soundtrack rows with their photos and stored files. */
async function deleteOsts(ctx: MutationCtx, osts: readonly { _id: Id<'osts'> }[]): Promise<void> {
  for (const ost of osts) {
    const photos = await ctx.db
      .query('photos')
      .withIndex('by_ost', (q) => q.eq('ostId', ost._id))
      .take(TUNING.share.maxPhotosPerOst);
    for (const photo of photos) {
      await ctx.storage.delete(photo.storageId);
      await ctx.db.delete('photos', photo._id);
    }
    await ctx.db.delete('osts', ost._id);
  }
}

/** A friend's local hour of day at a moment in time. */
const localHourAt = (persona: Persona, at: number) => normalizeHour(at / HOUR_MS + persona.home.utcOffsetHours);

/**
 * Where a friend's place is. Each named place sits at a fixed spot 300 m to
 * 1.8 km from home (picked by its name, not a real survey), so a day has
 * distinct stops and the same place is always the same stop; each play then
 * wanders up to about 80 m from it. No place name: at home.
 */
function pointFor(persona: Persona, place: string | undefined, random: () => number): { lat: number; lon: number } {
  const metresPerDegree = 111_320;
  let north = (random() - 0.5) * 160;
  let east = (random() - 0.5) * 160;
  if (place) {
    const spot = seededRandom(hashString(`${persona.deviceId}:place:${place}`));
    const distance = 300 + spot() * 1500;
    const bearing = spot() * 2 * Math.PI;
    north += Math.cos(bearing) * distance;
    east += Math.sin(bearing) * distance;
  }
  const { lat, lon } = persona.home;
  return {
    lat: Number((lat + north / metresPerDegree).toFixed(5)),
    lon: Number((lon + east / (metresPerDegree * Math.cos((lat * Math.PI) / 180))).toFixed(5)),
  };
}

function activityAt(persona: Persona, at: number): Activity | null {
  const hour = localHourAt(persona, at);
  return persona.day.find((block) => hour >= block.from && hour < block.to)?.activity ?? null;
}

type Slot = { startedAt: number; context: PlayContext };

function slotAt(persona: Persona, at: number, activity: Activity, random: () => number): Slot {
  const [low, high] = activity.cadence;
  const place = activity.places[Math.floor(random() * activity.places.length)];
  return {
    startedAt: Math.round(at),
    context: {
      cadenceSpm: Math.round(low + random() * (high - low)),
      weather: activity.weather,
      localHour: localHourAt(persona, at),
      setting: activity.setting,
      simulated: false,
      ...(place ? { placeName: place } : {}),
      ...pointFor(persona, place, random),
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
    return activity ? [slotAt(persona, newest, activity, random)] : [];
  }

  const { min, max } = TUNING.seedBackfillGapMs;
  const slots: Slot[] = [];
  for (let at = newest; at > now - TUNING.seedBackfillWindowMs; at -= min + random() * (max - min)) {
    const activity = activityAt(persona, at);
    if (activity) slots.push(slotAt(persona, at, activity, random));
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
  returns: v.union(
    v.null(),
    v.array(
      v.object({
        deviceId: v.string(),
        latestAt: v.union(v.number(), v.null()),
        /** Songs in the friend's latest plays, so the others can avoid them. */
        recentDeezerIds: v.array(v.number()),
      }),
    ),
  ),
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
            .take(TUNING.feed.maxPerProfile),
        ]);
        if (!profile) await ctx.db.insert('profiles', { deviceId, displayName, avatarEmoji, seeded: true });
        return {
          deviceId,
          latestAt: latest[0]?.startedAt ?? null,
          recentDeezerIds: latest.map((play) => play.deezerId),
        };
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
    const city = PERSONAS.find((persona) => persona.deviceId === deviceId)?.home.city;
    let added = 0;
    for (const play of [...plays].sort((a, b) => a.startedAt - b.startedAt)) {
      if (play.startedAt < earliest) continue;
      if (await recordPlay(ctx, { deviceId, ...play, city })) added += 1;
    }
    return added;
  },
});

/** The friend's newest play of the local day, or null when they have not played yet today. */
const latestPlayOf = (ctx: MutationCtx, deviceId: string, day: { dayStart: number; dayEnd: number }) =>
  ctx.db
    .query('plays')
    .withIndex('by_device_startedAt', (q) =>
      q.eq('deviceId', deviceId).gte('startedAt', day.dayStart).lt('startedAt', day.dayEnd),
    )
    .order('desc')
    .first();

/**
 * Gives each friend who has played today a soundtrack row with their title,
 * and reports which of them still owe the day its photo.
 */
export const soundtracks = internalMutation({
  args: { now: v.number() },
  returns: v.array(v.object({ deviceId: v.string(), date: v.string() })),
  handler: async (ctx, { now }) => {
    const owed: { deviceId: string; date: string }[] = [];
    for (const persona of PERSONAS) {
      const day = seedDayAt(persona, now);
      if (!(await latestPlayOf(ctx, persona.deviceId, day))) continue;
      const existing = await ctx.db
        .query('osts')
        .withIndex('by_device_date', (q) => q.eq('deviceId', persona.deviceId).eq('date', day.date))
        .first();
      const ost = existing ?? (await ensureOst(ctx, persona.deviceId, day));
      if (!existing && persona.ostTitle) await ctx.db.patch('osts', ost._id, { title: persona.ostTitle });
      if (!persona.photo) continue;
      const photo = await ctx.db
        .query('photos')
        .withIndex('by_ost', (q) => q.eq('ostId', ost._id))
        .first();
      if (!photo) owed.push({ deviceId: persona.deviceId, date: day.date });
    }
    return owed;
  },
});

/**
 * Puts a generated image on a friend's day, on the newest cue of that day.
 * When the day has a photo already, or is gone, the image is deleted instead,
 * so two overlapping seeder runs leave one photo and no stray file.
 */
export const attachPhoto = internalMutation({
  args: { deviceId: v.string(), date: v.string(), storageId: v.id('_storage') },
  returns: v.boolean(),
  handler: async (ctx, { deviceId, date, storageId }) => {
    if (!isSeedDevice(deviceId)) throw new Error(`${deviceId} is not a seeded friend`);
    const ost = await ctx.db
      .query('osts')
      .withIndex('by_device_date', (q) => q.eq('deviceId', deviceId).eq('date', date))
      .first();
    const taken = ost
      ? await ctx.db
          .query('photos')
          .withIndex('by_ost', (q) => q.eq('ostId', ost._id))
          .first()
      : null;
    const play = ost ? await latestPlayOf(ctx, deviceId, ost) : null;
    if (!ost || taken || !play) {
      await ctx.storage.delete(storageId);
      return false;
    }
    await ctx.db.insert('photos', { ostId: ost._id, playId: play._id, storageId, takenAt: play.startedAt });
    return true;
  },
});

/** Deletes seeded friends' plays from before `before`, a bounded batch per friend, and the soundtrack rows of days that ended by then. */
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
    for (const { deviceId } of PERSONAS) {
      const osts = await ctx.db
        .query('osts')
        .withIndex('by_device_dayStart', (q) => q.eq('deviceId', deviceId).lt('dayStart', before - DAY_MS))
        .take(20);
      await deleteOsts(ctx, osts);
    }
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
    // Their photos point at the deleted plays, so the soundtrack rows go too.
    for (const { deviceId } of PERSONAS) {
      const osts = await ctx.db
        .query('osts')
        .withIndex('by_device_dayStart', (q) => q.eq('deviceId', deviceId))
        .take(20);
      await deleteOsts(ctx, osts);
    }
    return { deleted: plays.length, more: batches.some((batch) => batch.length === limit) };
  },
});

/**
 * Creates the six friends if they are missing, appends whatever plays they
 * are due, titles their day and adds its photo, and prunes their plays older
 * than `seedPruneMs`. Run hourly by the
 * cron in crons.ts, and by hand after importing a library.
 */
export const friends = internalAction({
  args: {},
  returns: v.object({ seeded: v.boolean(), added: v.number(), pruned: v.number() }),
  handler: async (ctx): Promise<{ seeded: boolean; added: number; pruned: number }> => {
    const now = Date.now();
    const state: { deviceId: string; latestAt: number | null; recentDeezerIds: number[] }[] | null = await ctx.runMutation(
      internal.seed.begin,
      {},
    );
    if (!state) return { seeded: false, added: 0, pruned: 0 };

    // One friend at a time, sharing one list of taken songs: three friends with the
    // same song on the same day would give the game away.
    const chosen: number[] = state.flatMap((friend) => friend.recentDeezerIds);
    let added = 0;
    for (const persona of PERSONAS) {
      const latestAt = state.find((friend) => friend.deviceId === persona.deviceId)?.latestAt ?? null;
      const plays: Omit<NewPlay, 'deviceId'>[] = [];
      for (const { startedAt, context } of planSlots(persona, latestAt, now)) {
        const scene = buildScene({
          cadenceSpm: context.cadenceSpm,
          localHour: context.localHour,
          weather: context.weather,
          setting: context.setting,
        });
        const found = await findCandidates(ctx, { deviceId: persona.deviceId, scene, excludeDeezerIds: chosen });
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
      if (plays.length > 0) {
        const count: number = await ctx.runMutation(internal.seed.append, { deviceId: persona.deviceId, plays });
        added += count;
      }
    }

    const owed: { deviceId: string; date: string }[] = await ctx.runMutation(internal.seed.soundtracks, { now });
    for (const { deviceId, date } of owed) {
      const palette = PERSONAS.find((persona) => persona.deviceId === deviceId)?.photo;
      if (!palette) continue;
      const { width, height } = TUNING.share.seedPhoto;
      const png = bokehPng(hashString(`${deviceId}:${date}`), BOKEH_PALETTES[palette], width, height);
      const storageId = await ctx.storage.store(new Blob([png.slice().buffer], { type: 'image/png' }));
      await ctx.runMutation(internal.seed.attachPhoto, { deviceId, date, storageId });
    }

    const pruned: number = await ctx.runMutation(internal.seed.prune, { before: now - TUNING.seedPruneMs });
    return { seeded: true, added, pruned };
  },
});
