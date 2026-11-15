/**
 * Client-only constants for the engine. Anything that changes how the app
 * feels musically (when to switch songs, how long to crossfade, nudge sizes)
 * lives in `convex/tuning.ts`; this file only holds the mechanics that file
 * does not cover.
 */
export const CONFIG = {
  identity: {
    storageKey: 'score.deviceId.v1',
    /** Prefix for ids created on simulators, emulators, cloud test devices and web. */
    simulatedPrefix: 'sim-',
    /** Waits between attempts of `profiles.ensure` after a failure. */
    ensureRetryMs: [1000, 3000, 8000, 20000],
  },

  engine: {
    /** How often the engine looks at the playback position. Also the progress refresh rate. */
    tickMs: 250,
    /** A gap between ticks longer than this means the app was suspended. */
    suspendedGapMs: 2000,
    keepAwakeTag: 'score-session',
  },

  audio: {
    /**
     * Interval of the players' periodic status events. The engine polls the
     * position itself and only needs the events that fire at once (loaded,
     * finished, error), so this is kept slow.
     */
    statusIntervalMs: 1000,
    /** A preview that is not ready to play after this long counts as a failed load. */
    loadTimeoutMs: 8000,
    loadPollMs: 120,
    /** Volume is ramped in steps this far apart. */
    fadeStepMs: 40,
    /** Assumed length of a preview whose duration the player cannot report. */
    fallbackDurationMs: 30000,
    /** Within this distance of the end, a stopped player counts as finished. */
    endEpsilonMs: 250,
    /** Fade-in of the first song of a session. */
    firstFadeInMs: 800,
    /** Fade-in of a song that arrives after the previous one already ended. */
    gapFadeInMs: 600,
    /** Crossfade used by skip. */
    skipFadeMs: 600,
    /** Fade-out used by stop. */
    stopFadeMs: 400,
    /** Crossfade into the first item of a replay. */
    replayStartFadeMs: 400,
    /** A song that should be playing but is not gets a `play()` after this long... */
    stallResumeAfterMs: 2500,
    /** ...and then again this often, for as long as it stays stalled. */
    stallRetryEveryMs: 5000,
  },

  session: {
    /** A pick that has not answered after this long counts as a network failure. */
    pickTimeoutMs: 10000,
    /** Backoff between failed attempts: base, doubled each time, capped at max. */
    retryBaseMs: 1000,
    retryMaxMs: 5000,
    /** Consecutive failures before the user sees a message. */
    surfaceErrorAfter: 2,
    /** Consecutive failures before the session gives up. */
    giveUpAfter: 6,
    /** A song that has played this long clears the failure count. */
    healthyPlayMs: 3000,
    /** How many songs that failed to load are excluded from the next picks. */
    rememberFailedIds: 5,
  },

  replay: {
    /** A preview lookup that has not answered after this long makes the item unplayable. */
    previewTimeoutMs: 8000,
    /** This many failed or timed-out lookups in a row end the replay. */
    giveUpAfterUnreachable: 3,
  },

  sensing: {
    /** The highest cadence the engine believes. */
    maxCadenceSpm: 220,
    /** Pedometer updates arrive in batches; cadence holds this long after one, then decays. */
    cadenceGraceMs: 4000,
    /** Shortest span a cadence is computed over, so the first batch cannot spike it. */
    cadenceMinSpanMs: 3000,
    /**
     * GPS speed (metres per second) to cadence (steps per minute), linearly
     * interpolated. Used when there is no pedometer or motion access was denied.
     */
    speedToCadence: [
      { mps: 0.4, spm: 0 },
      { mps: 0.6, spm: 60 },
      { mps: 1.0, spm: 92 },
      { mps: 1.4, spm: 110 },
      { mps: 1.8, spm: 126 },
      { mps: 2.5, spm: 152 },
      { mps: 3.5, spm: 168 },
      { mps: 5.0, spm: 180 },
    ],
    /** Faster than this is a bike, car or train, not feet: cadence is zero. */
    maxOnFootMps: 7,
    location: {
      /** Android only: shortest time between updates. */
      timeIntervalMs: 2000,
      /** Updates stop when the user stops, which is what lets speed decay to zero. */
      distanceIntervalM: 2,
      /** Android: do not pop the "improve location accuracy" system dialog. */
      mayShowUserSettingsDialog: false,
      /** A last known position younger than this seeds weather before the first fix. */
      lastKnownMaxAgeMs: 10 * 60 * 1000,
    },
    geocodeMinDistanceM: 150,
    geocodeMinIntervalMs: 60 * 1000,
    weatherRefreshDistanceM: 2000,
    /** Shortest time between weather attempts, so a failing call is not hammered. */
    weatherRetryMs: 60 * 1000,
    weatherTimeoutMs: 10000,
    /** How often the clock-derived local hour is refreshed while sensors are off. */
    clockMs: 60 * 1000,
    placesStorageKey: 'score.places.v1',
    chosenLocationStorageKey: 'score.location.v1',
    /** How long each signal may take in a silent setup (a plain `start()`). */
    quickBudgetMs: 2500,
    /** A place lookup or search that has not answered after this long is given up on. */
    placeLookupTimeoutMs: 10000,
    /** The label of a device position the backend has no name for. */
    unnamedLocationLabel: 'Current location',
    /** Weather fetched for a point counts for a location this close to it. */
    sameSpotM: 100,
    calendarStorageKey: 'score.calendar.v1',
    /** The calendar is read again this often while it is in use, and whenever the app returns. */
    calendarRefreshMs: 5 * 60 * 1000,
    /** A position for tagging a place that has not arrived after this long is given up on. */
    placeFixTimeoutMs: 10000,
  },

  setup: {
    /** Each step of the setup sequence shows as working for at least this long... */
    minStepMs: 700,
    /** ...and its signal has about this long to come from the device before the demo source is used. */
    maxStepMs: 4000,
  },
} as const;

export const MESSAGES = {
  emptyLibrary: 'The song library is empty.',
  retrying: {
    network: "Can't reach the music right now. Retrying…",
    no_preview: "Couldn't find a playable song. Retrying…",
    playback: "That song wouldn't play. Trying another…",
  },
  gaveUp: {
    network: "Couldn't reach the music. Check your connection and try again.",
    no_preview: "Couldn't find a playable song. Try again in a moment.",
    playback: "Couldn't play the music. Try again in a moment.",
  },
  calendarDenied: 'Calendar access is off, so Score scores without your events. Turn it on in Settings.',
  calendarUnavailable: 'This build cannot read a calendar.',
  calendarUnreadable: "Couldn't read your calendar just now. Scoring without it.",
  occasionUnsupported: "The score can't follow events yet, so this cue was picked without one.",
  setupFailed: "Couldn't set the scene. Try again.",
  placeNoFix: "Couldn't tell where you are. Turn on location and try again.",
  profileUnavailable: "Couldn't save your profile. Check your connection and try again.",
} as const;
