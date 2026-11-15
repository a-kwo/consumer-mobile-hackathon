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
 *   useSetup()             { status, steps, scene, error, beginSetup(), resetSetup() }
 *       The sequence between the tap on "set the scene" and the first song.
 *       (`useSensing()` carries the same thing as `setup`, `beginSetup`,
 *       `resetSetup`.) `beginSetup()` does the work, one step after another:
 *         place     asks for location access, finds and names where you are
 *         weather   fetches the weather there
 *         time      reads the clock
 *         calendar  asks for calendar access, finds the next event
 *         pace      asks for motion access, starts sensing, takes a reading
 *         music     starts the session and waits for the first pick
 *       `steps` is those six, in order: { id, status: 'waiting' | 'working' |
 *       'done', title, detail, source }. `title` is the line to show while
 *       working ("Finding where you are"); `detail` is the finding once done
 *       ("5th Avenue, New York", "Rain, 12°", "Tuesday evening, 6:42pm",
 *       "Date in 40 min", "A steady walk, 104 steps/min", and for music the
 *       song, "Break My Stride · Matthew Wilder");
 *       `source` is 'device' or 'demo' (null for music). Each step works for
 *       at least 0.9 s, and the song is shown for 0.9 s before `status`
 *       turns 'done' (about 6 s in all when everything answers); a signal the device has not given after about 4 s
 *       comes from the demo source, so the whole thing takes a few seconds.
 *       `scene` is the scene from the signals gathered so far (null before
 *       the first), and the first pick's scene at the end.
 *       `status`: 'idle' | 'running' | 'done' | 'failed'. 'done' when the
 *       first song has been picked (the session is then 'starting', about to
 *       be 'playing'): move to the Now screen. 'failed', with `error`, only
 *       when the session could not start. It returns to 'idle' when the
 *       session stops, and from `resetSetup()`.
 *       Call `beginSetup()` from a tap: it is the only thing that shows
 *       permission prompts, and a browser only offers its location prompt in
 *       answer to one. Calling it again restarts the sequence (and replaces
 *       any music). A browser's location prompt may be answered late: the
 *       place step then shows the demo place, and `useSensing().location`
 *       switches to the real one when the answer comes.
 *
 *   useSensing()           { sources, live, context, scene, permissions,
 *                            location, locationStatus, locateDevice(),
 *                            searchPlaces(), chooseLocation(), clearLocation(),
 *                            demo, occasion, calendar..., places..., setup,
 *                            beginSetup(), resetSetup() }
 *       There is one mode: the app senses. Each of the five signals (place,
 *       weather, time, calendar, pace) comes from the device when the device
 *       or browser provides it and the user allows it, and from a demo
 *       scenario otherwise; `sources[signal]` says which ('device' | 'demo',
 *       null before it has been sensed). `live` holds the readings in effect
 *       (cadenceSpm, speedMps, weather, temperatureC, placeName, localHour),
 *       `context` what a pick would be made from, and `scene` is
 *       `buildScene(context + energy bias)`: `scene.label` is the title card.
 *       They keep updating while a session runs.
 *       `demo`: { scenarios: { id, label }[], activeId, choose(id | null) }.
 *       With nothing chosen, a scenario only fills the signals the device
 *       cannot give, a different one each setup, in rotation. `choose(id)`
 *       is the presenter's control: that scenario's place, pace, event and
 *       any pinned weather and hour then override the device, until
 *       `choose(null)`. It takes effect at once, also mid-session.
 *       `location`: { label, street, area, city, setting, lat, lon,
 *       source: 'device' | 'chosen' | 'demo' } | null. Show `location.label`.
 *       It is null before the first setup, and in the "at home" scenario.
 *       `searchPlaces(query)` resolves to at most five places and never
 *       rejects; `chooseLocation(place)` makes one the place over whatever
 *       the device says (remembered across reloads; counted as a demo
 *       source); `clearLocation()` forgets it. `locateDevice()` finds the
 *       device's position outside a setup; `locationStatus` is its outcome.
 *       The weather is always the real weather at the place, demo places
 *       included, unless a chosen scenario pins one or it cannot be fetched.
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
 *       `TUNING.playback`). With a real pedometer the first pick is made before
 *       it has reported, so it is a "still" song; the sharp-change rule
 *       replaces it once the user is walking.
 *       The normal way in is `beginSetup()`. A plain `start()` without a setup
 *       gathers the same signals from the same sources first, silently (it may
 *       show the permission prompts). `stop()` stops the music and the
 *       sensing, and ends a setup in progress.
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
 *     session or a replay; when the app is backgrounded the audio pauses and it resumes on
 *     return.
 *   - Preview URLs expire. They are fetched when needed and never stored;
 *     do not keep `track.previewUrl` anywhere.
 *   - Timing and musical thresholds live in `convex/tuning.ts`; the mechanics
 *     that file does not cover live in `./config`.
 */
export { ScoreProvider } from './provider';
export { useProfile, usePlaybackProgress, useReplay, useSensing, useSession, useSetup } from './hooks';
export type { ProfileApi, ReplayApi, SensingApi, SessionApi, SetupApi } from './hooks';
export type {
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
  SessionStatus,
  SetupSnapshot,
  SetupStep,
  SetupStepId,
  SignalId,
  SignalSource,
} from './types';
export type { ActiveOccasion } from '../../../convex/lib/occasion';
export type {
  Nudge,
  Occasion,
  OstEntry,
  PlayContext,
  Profile,
  Scene,
  Setting,
  Track,
  Weather,
} from '../../../convex/lib/validators';
