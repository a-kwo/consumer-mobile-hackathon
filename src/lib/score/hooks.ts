/**
 * The hooks screens use. Each one subscribes to one engine store with
 * `useSyncExternalStore` and adds the matching controls; all logic lives in the
 * engine. The controls are stable references, safe to pass to children.
 */
import { useSyncExternalStore } from 'react';

import type { PlayContext, Profile, Scene, Track } from '../../../convex/lib/validators';
import { useScoreEngine } from './provider';
import type {
  CalendarAccess,
  DemoControl,
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
  ScoreOccasion,
  SessionStatus,
  SetupSnapshot,
  SignalId,
  SignalSource,
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
  /** `'unknown'` until the user has been asked. */
  permissions: { motion: PermissionState; location: PermissionState };
  /** Where each signal comes from right now ('device' or 'demo'); null while it has not been sensed. */
  sources: Record<SignalId, SignalSource | null>;
  /** The readings in effect: pace, weather, place name, hour. */
  live: LiveReadings;
  /** The context a pick would be made from right now. */
  context: PlayContext;
  /** What the server would target right now: `buildScene` of the context and the energy bias. */
  scene: Scene;
  /** Where the user is, by name; null when not known. */
  location: ScoreLocation | null;
  /** 'locating' while the place is being found; 'denied', 'unavailable' or 'error' when it could not be. */
  locationStatus: LocationStatus;
  /** Finds the device's position and names it. In a browser, call it from a tap. */
  locateDevice(): void;
  /** Places matching a typed query, at most five. Never rejects: [] on failure. */
  searchPlaces(query: string): Promise<PlaceResult[]>;
  /** Makes a searched place the location, over what the device says, and remembers it across reloads. */
  chooseLocation(place: PlaceResult): void;
  clearLocation(): void;
  /** The presenter's control: the demo scenarios, and which one (if any) is chosen outright. */
  demo: DemoControl;
  /**
   * The occasion steering picks: the calendar's next event, or a scenario's.
   * `occasion.title` is the event's own name when there is one; it never leaves the device.
   */
  occasion: ScoreOccasion | null;
  /** Whether the device calendar is being read. */
  calendarEnabled: boolean;
  calendarAccess: CalendarAccess;
  /** Turning it on asks for calendar access (the first time); off stops setup from asking. */
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
  /** The setup sequence; the same value `useSetup()` returns. */
  setup: SetupSnapshot;
  beginSetup(): void;
  resetSetup(): void;
};

export type SetupApi = SetupSnapshot & {
  /** Runs the sequence from the top; call it from a tap. Safe at any time: it replaces a run in progress and any music. */
  beginSetup(): void;
  /** Back to 'idle'. Does not stop music that is already playing. */
  resetSetup(): void;
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
  /** Ends the session: music and sensing stop, and the setup returns to 'idle'. */
  stop(): void;
  /** Pauses in place after a short fade. Acts while 'playing' or 'starting'. */
  pause(): void;
  /** Carries on from a pause at the same position. Acts while 'paused'. */
  resume(): void;
  /** While paused, resumes first. */
  skip(): void;
  /** While paused, resumes first. */
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

/** What the app senses, and the setup sequence that starts it. */
export function useSensing(): SensingApi {
  const { sensing, setup } = useScoreEngine();
  const snapshot = useSyncExternalStore(sensing.store.subscribe, sensing.store.get, sensing.store.get);
  const sequence = useSyncExternalStore(setup.store.subscribe, setup.store.get, setup.store.get);
  return {
    ...snapshot,
    locateDevice: sensing.locateDevice,
    searchPlaces: sensing.searchPlaces,
    chooseLocation: sensing.chooseLocation,
    clearLocation: sensing.clearLocation,
    setCalendarEnabled: sensing.setCalendarEnabled,
    savePlace: sensing.savePlace,
    removePlace: sensing.removePlace,
    setup: sequence,
    beginSetup: setup.begin,
    resetSetup: setup.reset,
  };
}

/** The setup sequence alone, for a screen that shows only that. */
export function useSetup(): SetupApi {
  const { setup } = useScoreEngine();
  const snapshot = useSyncExternalStore(setup.store.subscribe, setup.store.get, setup.store.get);
  return { ...snapshot, beginSetup: setup.begin, resetSetup: setup.reset };
}

/** The live scoring session. */
export function useSession(): SessionApi {
  const { session } = useScoreEngine();
  const snapshot = useSyncExternalStore(session.store.subscribe, session.store.get, session.store.get);
  return {
    ...snapshot,
    start: session.start,
    stop: session.stop,
    pause: session.pause,
    resume: session.resume,
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
