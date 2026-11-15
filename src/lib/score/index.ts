/**
 * Score engine: the public surface.
 *
 * Everything a screen needs comes from this file:
 *
 *   import { useSession, useSensing, usePlaybackProgress } from '@/lib/score';
 *
 * SETUP
 *   Mount `<ScoreProvider>` once, inside `<ConvexProvider>`, around the whole
 *   app (the root layout). The provider owns the two audio players, so playback
 *   continues while the user moves between screens. Every hook below throws if
 *   it is used outside the provider.
 *
 * HOOKS
 *   useProfile()           { deviceId, profile, update(patch) }
 *       The device id (null only for the first moments after launch; prefixed
 *       "sim-" on simulators, emulators, cloud devices and web) and its
 *       profile, kept fresh by a Convex subscription. `update` rejects with a
 *       readable Error when the change cannot be saved.
 *
 *   useSensing()           { mode, setMode, liveAvailable, permissions,
 *                            sim, setSim, live, context, scene }
 *       `mode` is 'live' or 'simulated'. It starts as 'live' on a real phone
 *       with a pedometer and as 'simulated' everywhere else.
 *       `setSim({ cadenceSpm, localHour, weather, setting })` drives the
 *       simulator. `context` is what a pick would be made from right now and
 *       `scene` is `buildScene(context + energy bias)`: use `scene.label` for a
 *       live preview of the title card.
 *       Permission prompts appear only from `setMode('live')` or from
 *       `useSession().start()` in live mode. Sensors run while a live session
 *       is on, or after `setMode('live')` until the session stops or the mode
 *       changes; `live` reads zero cadence while they are off. Without a
 *       pedometer (or without motion access) cadence is estimated from GPS
 *       speed; without either it stays at zero and everything still works.
 *       `setMode('live')` is allowed even when `liveAvailable` is false; it is
 *       up to the screen whether to offer it.
 *
 *   useSession()           { status, track, scene, isLoadingNext, error,
 *                            energyBias, nudgePicksLeft,
 *                            start(), stop(), skip(), nudge(direction) }
 *       `status` is 'idle', 'starting' (first pick on its way) or 'playing'.
 *       `track` and `scene` describe the song that is audible; show
 *       `track.reason` and `scene.label`. `error` is a sentence for the user or
 *       null; when the session gives up it returns to 'idle' with the error
 *       still set, and `start()` or `stop()` clears it.
 *       `skip()` works while 'playing'. `nudge('calmer' | 'more_energy')` works
 *       while 'starting' or 'playing'. All four controls are safe to call at
 *       any time and never throw. `isLoadingNext` is true for the whole of
 *       'starting', and afterwards whenever a pick is being fetched or its
 *       audio is loading. That includes the quiet prefetch about nine seconds
 *       before the end of every song, so do not hang a blocking spinner on it.
 *       The song changes by itself near the end of each preview, and earlier
 *       when the context has moved sharply and stayed there (see
 *       `TUNING.playback`). In live mode the first pick is made before the
 *       pedometer has reported, so it is a "still" song; the sharp-change rule
 *       replaces it once the user is walking.
 *
 *   usePlaybackProgress()  { positionMs, durationMs, isPlaying }
 *       Position of the current song (live or replay), four updates a second.
 *       All zeros and false when nothing is playing. Use it only in the
 *       component that draws progress.
 *
 *   useReplay()            { listId, index, item, status, play(...), stop() }
 *       `play(listId, items, startIndex?)` plays a list of logged songs from
 *       `startIndex` to the end, crossfading; items without a preview are
 *       skipped. `status` is 'idle', 'loading' (first item on its way) or
 *       'playing'. When idle, `listId` and `item` are null and `index` is -1.
 *       Compare `listId` and `index` to highlight the row that is playing.
 *
 * RULES OF THE ROAD
 *   - The live session and replay share the players: starting one stops the
 *     other.
 *   - Playback is foreground only. The screen is kept awake during a live
 *     session; when the app is backgrounded the audio pauses and it resumes on
 *     return.
 *   - Preview URLs expire. They are fetched when needed and never stored;
 *     do not keep `track.previewUrl` anywhere.
 *   - Timing and musical thresholds live in `convex/tuning.ts`; the mechanics
 *     that file does not cover live in `./config`.
 */
export { ScoreProvider } from './provider';
export { useProfile, usePlaybackProgress, useReplay, useSensing, useSession } from './hooks';
export type { ProfileApi, ReplayApi, SensingApi, SessionApi } from './hooks';
export type {
  LiveReadings,
  NudgeDirection,
  PermissionState,
  PlaybackProgress,
  ProfilePatch,
  ReplayItem,
  ReplayStatus,
  SensingMode,
  SessionStatus,
  SimValues,
} from './types';
export type {
  Nudge,
  OstEntry,
  PlayContext,
  Profile,
  Scene,
  Setting,
  Track,
  Weather,
} from '../../../convex/lib/validators';
