/**
 * The hooks screens use. Each one subscribes to one engine store with
 * `useSyncExternalStore` and adds the matching controls; all logic lives in the
 * engine. The controls are stable references, safe to pass to children.
 */
import { useSyncExternalStore } from 'react';

import type { ActiveOccasion } from '../../../convex/lib/occasion';
import type { PlayContext, Profile, Scene, Track } from '../../../convex/lib/validators';
import { useScoreEngine } from './provider';
import type {
  CalendarAccess,
  LiveReadings,
  LocationStatus,
  NudgeDirection,
  PermissionState,
  PlaceKind,
  PlaceResult,
  PlaybackProgress,
  ProfilePatch,
  ReplayItem,
  ReplayStatus,
  SavedPlace,
  ScoreLocation,
  SensingMode,
  SessionStatus,
  SimValues,
  SimView,
} from './types';

export type ProfileApi = {
  /** Null only for the first moments after launch. */
  deviceId: string | null;
  /** Null until the backend has answered once. */
  profile: Profile | null;
  /** Rejects with a readable `Error` when the change could not be saved. */
  update(patch: ProfilePatch): Promise<void>;
};

export type SensingApi = {
  mode: SensingMode;
  /**
   * Switching to `'live'` asks for motion and location access (the first time)
   * and turns the sensors on; switching to `'simulated'` turns them off.
   */
  setMode(mode: SensingMode): void;
  /** False on simulators, emulators, web and phones without a pedometer. */
  liveAvailable: boolean;
  /** `'unknown'` until the user has been asked. */
  permissions: { motion: PermissionState; location: PermissionState };
  /**
   * Simulator values in effect. `localHour` is a float, 0 to 24. With a location
   * set, `weather` and `setting` follow it until picked through `setSim`;
   * `weatherSource` and `settingSource` say which ('location' | 'manual').
   */
  sim: SimView;
  /** Cadence is rounded and clamped to 0–220; `localHour` is clamped to 0–24. */
  setSim(patch: Partial<SimValues>): void;
  /** Latest live readings (zeros, `'any'` and nulls until the sensors report). */
  live: LiveReadings;
  /** The effective context right now: simulator values or live readings, by mode. */
  context: PlayContext;
  /** What the server would target right now: `buildScene` of the context and the energy bias. */
  scene: Scene;
  /** Where the user is, by name, in either mode; null when not known. */
  location: ScoreLocation | null;
  /** 'locating' while `locateDevice` works; 'denied', 'unavailable' or 'error' when it failed. */
  locationStatus: LocationStatus;
  /**
   * Finds the device's position (asking for permission if needed; in a browser
   * call it from a tap), names it, and sets `location` with source 'device'.
   */
  locateDevice(): void;
  /** The same function under the name the brief gave it. It is not a React hook. */
  useDeviceLocation(): void;
  /** Places matching a typed query, at most five. Never rejects: [] on failure. */
  searchPlaces(query: string): Promise<PlaceResult[]>;
  /** Sets `location` with source 'chosen' and remembers it across reloads. */
  chooseLocation(place: PlaceResult): void;
  clearLocation(): void;
  /** The occasion steering picks: the simulator's event, or in live mode the calendar's next one. */
  occasion: ActiveOccasion | null;
  /** Whether calendar reading is on. The calendar is only read in live mode. */
  calendarEnabled: boolean;
  calendarAccess: CalendarAccess;
  /** Turning it on asks for calendar access (the first time). Refusal changes nothing else. */
  setCalendarEnabled(enabled: boolean): void;
  /** A sentence about the calendar or the occasion, or null. */
  occasionNotice: string | null;
  /** Places tagged on this phone, oldest first. They never leave it. */
  places: readonly SavedPlace[];
  /** The saved place the phone is in right now, when its position is known. */
  herePlace: SavedPlace | null;
  /** Tags the current position; asks for location access if needed. */
  savePlace(kind: PlaceKind): void;
  removePlace(id: string): void;
  isSavingPlace: boolean;
  placeNotice: string | null;
};

export type SessionApi = {
  status: SessionStatus;
  /** The song playing now. */
  track: Track | null;
  /** The scene that song was picked for. */
  scene: Scene | null;
  /** True while a pick is being fetched or its audio is loading. */
  isLoadingNext: boolean;
  /** A message for the user, or null. */
  error: string | null;
  /** The nudge being carried, from -0.4 to 0.4. */
  energyBias: number;
  /** How many more songs the nudge applies to. */
  nudgePicksLeft: number;
  start(): void;
  stop(): void;
  skip(): void;
  nudge(direction: NudgeDirection): void;
};

export type ReplayApi = {
  /** Which list is playing, as passed to `play`; null when idle. */
  listId: string | null;
  /** Index of the current item in that list; -1 when idle. */
  index: number;
  item: ReplayItem | null;
  status: ReplayStatus;
  play(listId: string, items: readonly ReplayItem[], startIndex?: number): void;
  stop(): void;
};

/** Identity: the device id and its profile. */
export function useProfile(): ProfileApi {
  const { identity } = useScoreEngine();
  const snapshot = useSyncExternalStore(identity.store.subscribe, identity.store.get, identity.store.get);
  return { deviceId: snapshot.deviceId, profile: snapshot.profile, update: identity.update };
}

/** Sensing and the simulator. */
export function useSensing(): SensingApi {
  const { sensing } = useScoreEngine();
  const snapshot = useSyncExternalStore(sensing.store.subscribe, sensing.store.get, sensing.store.get);
  return {
    ...snapshot,
    setMode: sensing.setMode,
    setSim: sensing.setSim,
    setCalendarEnabled: sensing.setCalendarEnabled,
    savePlace: sensing.savePlace,
    removePlace: sensing.removePlace,
    locateDevice: sensing.locateDevice,
    useDeviceLocation: sensing.locateDevice,
    searchPlaces: sensing.searchPlaces,
    chooseLocation: sensing.chooseLocation,
    clearLocation: sensing.clearLocation,
  };
}

/** The live scoring session. */
export function useSession(): SessionApi {
  const { session } = useScoreEngine();
  const snapshot = useSyncExternalStore(session.store.subscribe, session.store.get, session.store.get);
  return {
    ...snapshot,
    start: session.start,
    stop: session.stop,
    skip: session.skip,
    nudge: session.nudge,
  };
}

/**
 * Position of the song that is playing (from the live session, or from a
 * replay), refreshed four times a second. Kept apart from `useSession` so that
 * only progress UI re-renders at that rate.
 */
export function usePlaybackProgress(): PlaybackProgress {
  const { progress } = useScoreEngine();
  return useSyncExternalStore(progress.subscribe, progress.get, progress.get);
}

/** Replay of logged songs, for the soundtrack and feed screens. */
export function useReplay(): ReplayApi {
  const { replay } = useScoreEngine();
  const snapshot = useSyncExternalStore(replay.store.subscribe, replay.store.get, replay.store.get);
  return { ...snapshot, play: replay.play, stop: replay.stop };
}
