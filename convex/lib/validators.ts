/**
 * Shared argument and return shapes. Pure: imports only `convex/values`, so the
 * app can import these types too.
 *
 * The id lists must stay in sync with shared/vocab.json.
 */
import { type Infer, v } from 'convex/values';

export const PACES = ['still', 'stroll', 'walk', 'brisk', 'run'] as const;
export const WEATHERS = ['any', 'clear', 'cloudy', 'fog', 'rain', 'snow', 'storm'] as const;
export const TIMES_OF_DAY = ['morning', 'afternoon', 'evening', 'night'] as const;
export const SETTINGS = ['any', 'city', 'nature', 'indoors', 'transit', 'gym'] as const;
export const NUDGES = ['calmer', 'more_energy', 'skip'] as const;

export const paceV = v.union(
  v.literal('still'),
  v.literal('stroll'),
  v.literal('walk'),
  v.literal('brisk'),
  v.literal('run'),
);
export const weatherV = v.union(
  v.literal('any'),
  v.literal('clear'),
  v.literal('cloudy'),
  v.literal('fog'),
  v.literal('rain'),
  v.literal('snow'),
  v.literal('storm'),
);
export const timeOfDayV = v.union(
  v.literal('morning'),
  v.literal('afternoon'),
  v.literal('evening'),
  v.literal('night'),
);
export const settingV = v.union(
  v.literal('any'),
  v.literal('city'),
  v.literal('nature'),
  v.literal('indoors'),
  v.literal('transit'),
  v.literal('gym'),
);
export const nudgeV = v.union(v.literal('calmer'), v.literal('more_energy'), v.literal('skip'));

export type Pace = Infer<typeof paceV>;
export type Weather = Infer<typeof weatherV>;
export type TimeOfDay = Infer<typeof timeOfDayV>;
export type Setting = Infer<typeof settingV>;
export type Nudge = Infer<typeof nudgeV>;

/** The moment, reduced to what matching needs. */
export const sceneV = v.object({
  /** `pace|weather|timeOfDay|setting`, the key of a row in the `scenes` table. */
  key: v.string(),
  /** Human label, lower case, e.g. "slow rainy walk in the city, late night". */
  label: v.string(),
  pace: paceV,
  weather: weatherV,
  timeOfDay: timeOfDayV,
  setting: settingV,
  /** Target energy, 0 to 1. */
  energy: v.number(),
  /** Target valence, 0 to 1. */
  valence: v.number(),
  /** Target BPM, or null when the user is still. */
  bpm: v.union(v.number(), v.null()),
  /** Outside temperature when the weather came from the weather API. */
  temperatureC: v.union(v.number(), v.null()),
});
export type Scene = Infer<typeof sceneV>;

/** One pick, ready to play. `previewUrl` expires: never store it. */
export const trackV = v.object({
  deezerId: v.number(),
  title: v.string(),
  artist: v.string(),
  coverUrl: v.string(),
  /** Raw dominant cover colour, e.g. "#C8432B". Absent when the cover has no usable colour. */
  coverColor: v.optional(v.string()),
  previewUrl: v.string(),
  bpm: v.number(),
  energy: v.number(),
  valence: v.number(),
  moods: v.array(v.string()),
  /** One line explaining the pick, e.g. "104 BPM matches your stride · rainy, late night". */
  reason: v.string(),
});
export type Track = Infer<typeof trackV>;

/** The context a play happened in, stored with the play. */
export const playContextV = v.object({
  cadenceSpm: v.number(),
  speedMps: v.optional(v.number()),
  weather: weatherV,
  temperatureC: v.optional(v.number()),
  /** Local hour of day as a float, 0 to 24. From the device clock or the simulator. */
  localHour: v.number(),
  setting: settingV,
  /** True when the values came from the simulator screen. */
  simulated: v.boolean(),
  /** Street or neighbourhood from reverse geocoding, when known. */
  placeName: v.optional(v.string()),
  lat: v.optional(v.number()),
  lon: v.optional(v.number()),
});
export type PlayContext = Infer<typeof playContextV>;

export const profileV = v.object({
  deviceId: v.string(),
  displayName: v.string(),
  avatarEmoji: v.string(),
});
export type Profile = Infer<typeof profileV>;

/** One entry of a daily soundtrack. */
export const ostEntryV = v.object({
  playId: v.id('plays'),
  /** Generated title, e.g. "Rain on 4th Street, 6:12pm". */
  title: v.string(),
  songTitle: v.string(),
  artist: v.string(),
  coverUrl: v.string(),
  /** Raw dominant cover colour, when the song had one at log time. */
  coverColor: v.optional(v.string()),
  deezerId: v.number(),
  bpm: v.number(),
  moods: v.array(v.string()),
  sceneLabel: v.string(),
  reason: v.string(),
  startedAt: v.number(),
  weather: weatherV,
  localHour: v.number(),
});
export type OstEntry = Infer<typeof ostEntryV>;

export const ostV = v.object({
  entries: v.array(ostEntryV),
  /** Up to three moods that dominate the day, most common first. */
  topMoods: v.array(v.string()),
  /** One line summarising the day, e.g. "mostly reflective, a little hopeful". */
  summary: v.string(),
});
export type Ost = Infer<typeof ostV>;

export const feedItemV = v.object({
  profile: profileV,
  entries: v.array(ostEntryV),
  topMoods: v.array(v.string()),
  summary: v.string(),
  /** startedAt of the newest entry. */
  latestAt: v.number(),
});
export type FeedItem = Infer<typeof feedItemV>;
