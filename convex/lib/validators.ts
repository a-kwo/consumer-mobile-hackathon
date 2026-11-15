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
/** What a calendar event can be recognised as. See lib/occasion.ts. */
export const OCCASIONS = ['game', 'workout', 'focus', 'party', 'travel', 'wind_down', 'date'] as const;

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
export const occasionV = v.union(
  v.literal('game'),
  v.literal('workout'),
  v.literal('focus'),
  v.literal('party'),
  v.literal('travel'),
  v.literal('wind_down'),
  v.literal('date'),
);

export type Pace = Infer<typeof paceV>;
export type Weather = Infer<typeof weatherV>;
export type TimeOfDay = Infer<typeof timeOfDayV>;
export type Setting = Infer<typeof settingV>;
export type Nudge = Infer<typeof nudgeV>;
export type Occasion = Infer<typeof occasionV>;

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
  /** The calendar occasion steering this scene. Absent when there is none. */
  occasion: v.optional(occasionV),
  /** Why the occasion matters right now, e.g. "Game in 45 min · building up". */
  occasionLine: v.optional(v.string()),
});
export type Scene = Infer<typeof sceneV>;

/** One pick, ready to play. `previewUrl` expires: never store it. */
export const trackV = v.object({
  deezerId: v.number(),
  title: v.string(),
  artist: v.string(),
  coverUrl: v.string(),
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
  /** The calendar occasion that steered the pick. Only the id: never the event's text. */
  occasion: v.optional(occasionV),
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
  deezerId: v.number(),
  bpm: v.number(),
  moods: v.array(v.string()),
  sceneLabel: v.string(),
  reason: v.string(),
  startedAt: v.number(),
  weather: weatherV,
  localHour: v.number(),
  /** The photo taken during this cue, when there is one. */
  photoUrl: v.optional(v.string()),
  /** `ost:get` only, when the soundtrack hides its places: the title other people see. */
  publicTitle: v.optional(v.string()),
});
export type OstEntry = Infer<typeof ostEntryV>;

/** Who may see a soundtrack. No `osts` row means `friends`. `public` is reserved for the Everyone tab. */
export const visibilityV = v.union(v.literal('private'), v.literal('friends'), v.literal('public'));
export type Visibility = Infer<typeof visibilityV>;

/** One photo of a soundtrack, as its owner sees it. */
export const ostPhotoV = v.object({
  photoId: v.id('photos'),
  url: v.string(),
  takenAt: v.number(),
  /** The cue that was playing when it was taken. */
  playId: v.optional(v.id('plays')),
});
export type OstPhoto = Infer<typeof ostPhotoV>;

export const ostV = v.object({
  entries: v.array(ostEntryV),
  /** Up to three moods that dominate the day, most common first. */
  topMoods: v.array(v.string()),
  /** One line summarising the day, e.g. "mostly reflective, a little hopeful". */
  summary: v.string(),
  /** The owner's own title. Absent: show the date. */
  title: v.optional(v.string()),
  /** The three below are absent until the day has an `osts` row; read them as friends, false and none. */
  visibility: v.optional(visibilityV),
  hideLocations: v.optional(v.boolean()),
  /** Oldest first. The first one is the soundtrack's lead image. */
  photos: v.optional(v.array(ostPhotoV)),
});
export type Ost = Infer<typeof ostV>;

export const feedItemV = v.object({
  profile: profileV,
  entries: v.array(ostEntryV),
  topMoods: v.array(v.string()),
  summary: v.string(),
  /** startedAt of the newest entry. */
  latestAt: v.number(),
  /** The owner's title for the newest day in `entries`. */
  title: v.optional(v.string()),
  /** The lead image: the first photo of the newest day that has one. */
  leadPhotoUrl: v.optional(v.string()),
  /** Every photo of the days in `entries`, oldest first. */
  photoUrls: v.optional(v.array(v.string())),
});
export type FeedItem = Infer<typeof feedItemV>;
