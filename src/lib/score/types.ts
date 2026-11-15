/**
 * Types shared across the engine. The public ones are re-exported from
 * `./index`; `Backend` is the engine's only view of Convex.
 */
import type { FunctionArgs, FunctionReturnType } from 'convex/server';

import type { api } from '../../../convex/_generated/api';
import type {
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
};

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
  sim: SimValues;
  live: LiveReadings;
  context: PlayContext;
  scene: Scene;
};

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
  /**
   * Subscribes to the device's profile. `onChange` is called with the current
   * value when it is known and again whenever it changes. Returns unsubscribe.
   */
  watchProfile(deviceId: string, onChange: (profile: Profile | null) => void): () => void;
}
