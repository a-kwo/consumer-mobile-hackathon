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
  PlayContext,
  Profile,
  Scene,
  Track,
  Weather,
} from '../../../convex/lib/validators';

// ---------------------------------------------------------------- sensing

export type PermissionState = 'unknown' | 'granted' | 'denied';

/** The five things a pick is made from. */
export type SignalId = 'place' | 'weather' | 'time' | 'calendar' | 'pace';
/** `device`: really sensed. `demo`: from a demo scenario, because the device could not say. */
export type SignalSource = 'device' | 'demo';
/** What sensing one signal found, as a short line for the user, and where it came from. */
export type SignalFinding = { detail: string; source: SignalSource };

export type { LocationStatus, PlaceResult, ScoreLocation };

/** `'unavailable'` when this build or platform has no calendar module. */
export type CalendarAccess = PermissionState | 'unavailable';

/** The readings in effect, whatever their source. */
export type LiveReadings = {
  /** Steps per minute, a whole number. */
  cadenceSpm: number;
  /** Metres per second from GPS, or null when there is none. */
  speedMps: number | null;
  /** `'any'` until the weather is known. */
  weather: Weather;
  temperatureC: number | null;
  /** The short name of the place: street, else area, else city. */
  placeName: string | null;
  /** The hour in effect as a float, 0 to 24: the device clock unless a chosen scenario pins one. */
  localHour: number;
};

/** The presenter's control over the demo scenarios. */
export type DemoControl = {
  scenarios: readonly { id: string; label: string }[];
  /** The scenario chosen outright, or null while the app senses for itself. */
  activeId: string | null;
  /** Chooses a scenario (it then overrides the device), or with null releases it. */
  choose(id: string | null): void;
};

export type SensingSnapshot = {
  permissions: { motion: PermissionState; location: PermissionState };
  /** Where each signal comes from right now; null while it has not been sensed. */
  sources: Record<SignalId, SignalSource | null>;
  live: LiveReadings;
  context: PlayContext;
  scene: Scene;
  /** Where the user is, by name; null when not known (or at home in the demo). */
  location: ScoreLocation | null;
  locationStatus: LocationStatus;
  demo: DemoControl;
  /** The occasion steering picks right now: the calendar's next event, or a scenario's. */
  occasion: ActiveOccasion | null;
  /** Whether the device calendar is being read. */
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

// ---------------------------------------------------------------- setup

export type SetupStepId = SignalId | 'music';

export type SetupStep = {
  id: SetupStepId;
  status: 'waiting' | 'working' | 'done';
  /** Short present-tense line while working, e.g. "Finding where you are". */
  title: string;
  /** The finding once done, e.g. "5th Avenue, New York". Null until done. */
  detail: string | null;
  /** Null until done, and always null for 'music'. */
  source: SignalSource | null;
};

export type SetupSnapshot = {
  status: 'idle' | 'running' | 'done' | 'failed';
  steps: readonly SetupStep[];
  /** The scene built from the signals gathered so far; null before the first step finishes. */
  scene: Scene | null;
  error: string | null;
};

// ---------------------------------------------------------------- session

export type SessionStatus = 'idle' | 'starting' | 'playing' | 'paused';
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
