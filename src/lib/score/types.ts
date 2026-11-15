/**
 * Types shared across the engine. The public ones are re-exported from
 * `./index`; `Backend` is the engine's only view of Convex.
 */
import type { FunctionArgs, FunctionReturnType } from 'convex/server';

import type { api } from '../../../convex/_generated/api';
import type { ActiveOccasion } from '../../../convex/lib/occasion';
import type { LocationStatus, PlaceResult, ScoreLocation } from '../sensing/location';
import type { PlaceKind, SavedPlace } from '../sensing/places';
import type {
  Occasion,
  PlayContext,
  Profile,
  Scene,
  Setting,
  Track,
  Weather,
} from '../../../convex/lib/validators';

// ---------------------------------------------------------------- sensing

export type SensingMode = 'live' | 'simulated';
export type PermissionState = 'unknown' | 'granted' | 'denied';

/** Values set on the Simulator screen. `localHour` is a float, 0 to 24. */
export type SimValues = {
  cadenceSpm: number;
  localHour: number;
  weather: Weather;
  setting: Setting;
  /** The simulated upcoming event; null or absent for none. */
  occasion?: Occasion | null;
  /** Minutes until that event starts; zero means it is underway. */
  minutesUntil?: number;
};

/** Where a simulator field's value comes from: the user's pick, or the location. */
export type SimSource = 'location' | 'manual';

/**
 * The simulator values in effect. With a location set, `weather` and `setting`
 * follow it until the user picks them through `setSim`; the sources say which.
 */
export type SimView = SimValues & { weatherSource: SimSource; settingSource: SimSource };

export type { LocationStatus, PlaceResult, ScoreLocation };

/** `'unavailable'` when this build or platform has no calendar module. */
export type CalendarAccess = PermissionState | 'unavailable';

/** The latest readings from the phone's sensors. */
export type LiveReadings = {
  /** Steps per minute, a whole number. Zero until the sensors report. */
  cadenceSpm: number;
  /** Metres per second from GPS, or null when there is no recent fix. */
  speedMps: number | null;
  /** `'any'` until the weather for the first fix arrives. */
  weather: Weather;
  temperatureC: number | null;
  /** Street or neighbourhood from reverse geocoding. */
  placeName: string | null;
  /** The device clock as a float hour, 0 to 24. */
  localHour: number;
};

export type SensingSnapshot = {
  mode: SensingMode;
  liveAvailable: boolean;
  permissions: { motion: PermissionState; location: PermissionState };
  sim: SimView;
  live: LiveReadings;
  context: PlayContext;
  scene: Scene;
  /** Where the user is, by name; null when not known. */
  location: ScoreLocation | null;
  locationStatus: LocationStatus;
  /** The occasion steering picks right now: the simulated one, or the calendar's in live mode. */
  occasion: ActiveOccasion | null;
  /** Whether the user turned calendar reading on. It is only ever read in live mode. */
  calendarEnabled: boolean;
  calendarAccess: CalendarAccess;
  /** A sentence about the calendar or the occasion for the user, or null. */
  occasionNotice: string | null;
  /** Places tagged on this phone, oldest first. */
  places: readonly SavedPlace[];
  /** The saved place the phone is in, when its position is known. */
  herePlace: SavedPlace | null;
  /** True while a position is being found for a place being tagged. */
  isSavingPlace: boolean;
  placeNotice: string | null;
};

export type { PlaceKind, SavedPlace };

// ---------------------------------------------------------------- session

export type SessionStatus = 'idle' | 'starting' | 'playing';
export type NudgeDirection = 'calmer' | 'more_energy';

export type SessionSnapshot = {
  status: SessionStatus;
  track: Track | null;
  scene: Scene | null;
  isLoadingNext: boolean;
  error: string | null;
  energyBias: number;
  nudgePicksLeft: number;
};

export type PlaybackProgress = {
  positionMs: number;
  durationMs: number;
  isPlaying: boolean;
};

// ---------------------------------------------------------------- replay

/** One replayable song: an entry of a soundtrack or of a friend's feed item. */
export type ReplayItem = {
  deezerId: number;
  title: string;
  artist: string;
  coverUrl: string;
  subtitle?: string;
};

export type ReplayStatus = 'idle' | 'loading' | 'playing';

export type ReplaySnapshot = {
  listId: string | null;
  index: number;
  item: ReplayItem | null;
  status: ReplayStatus;
};

// ---------------------------------------------------------------- identity

export type IdentitySnapshot = {
  deviceId: string | null;
  profile: Profile | null;
};

export type ProfilePatch = { displayName?: string; avatarEmoji?: string };

// ---------------------------------------------------------------- backend

export type PickArgs = FunctionArgs<typeof api.next.pick>;
export type PickResult = FunctionReturnType<typeof api.next.pick>;
export type LogPlayArgs = FunctionArgs<typeof api.plays.log>;
export type PlayId = NonNullable<FunctionReturnType<typeof api.plays.log>>;
export type WeatherReport = FunctionReturnType<typeof api.weather.current>;

/**
 * Everything the engine asks of Convex. `ScoreProvider` builds it from the
 * Convex React hooks; tests can pass a fake.
 */
export interface Backend {
  pick(args: PickArgs): Promise<PickResult>;
  logPlay(args: LogPlayArgs): Promise<PlayId | null>;
  markSkipped(args: { deviceId: string; playId: PlayId }): Promise<unknown>;
  ensureProfile(args: { deviceId: string }): Promise<Profile>;
  updateProfile(args: { deviceId: string } & ProfilePatch): Promise<Profile>;
  preview(args: { deezerId: number }): Promise<{ previewUrl: string | null }>;
  weather(args: { lat: number; lon: number }): Promise<WeatherReport>;
  /** The place at a coordinate, or null when nothing is there. */
  reversePlace(args: { lat: number; lon: number }): Promise<Omit<PlaceResult, 'lat' | 'lon'> | null>;
  /** Up to five places matching a typed query. */
  searchPlaces(args: { query: string }): Promise<PlaceResult[]>;
  /**
   * Subscribes to the device's profile. `onChange` is called with the current
   * value when it is known and again whenever it changes. Returns unsubscribe.
   */
  watchProfile(deviceId: string, onChange: (profile: Profile | null) => void): () => void;
}
