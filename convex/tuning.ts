/**
 * Every matching weight and threshold lives here, so the feel of the app can be
 * tuned by ear in one place. Pure data: safe to import from Convex functions and
 * from the app.
 */
export const TUNING = {
  /** Cadence (steps per minute) to target energy, linearly interpolated. */
  energyCurve: [
    { spm: 0, energy: 0.2 },
    { spm: 30, energy: 0.2 },
    { spm: 100, energy: 0.5 },
    { spm: 160, energy: 0.9 },
    { spm: 190, energy: 0.98 },
  ],
  /** Lowest cadence (steps per minute) of each pace. Below `stroll` the user is still: no BPM filter. */
  paceMinSpm: { still: 0, stroll: 30, walk: 85, brisk: 112, run: 138 },
  /** First hour of each time of day. `night` wraps past midnight until `morning`. */
  timeOfDayStartHour: { morning: 5, afternoon: 12, evening: 17, night: 22 },

  /** Late-night energy shift, applied from nightStartHour until nightEndHour. */
  nightEnergyShift: -0.15,
  nightStartHour: 22,
  nightEndHour: 6,

  /** Target valence by weather. */
  valenceByWeather: {
    any: 0.55,
    clear: 0.7,
    cloudy: 0.5,
    fog: 0.42,
    rain: 0.35,
    snow: 0.55,
    storm: 0.28,
  },
  /** Small valence shifts by time of day. */
  valenceShiftByTime: {
    morning: 0.05,
    afternoon: 0,
    evening: 0,
    night: -0.05,
  },
  /** Small energy and valence shifts by setting. */
  settingShift: {
    any: { energy: 0, valence: 0 },
    city: { energy: 0.03, valence: 0 },
    nature: { energy: 0, valence: 0.05 },
    indoors: { energy: -0.05, valence: 0 },
    transit: { energy: -0.03, valence: -0.02 },
    // Large on purpose: standing still at the gym is lifting, not resting.
    gym: { energy: 0.5, valence: 0.03 },
  },

  /** A nudge shifts energy by this much, for this many picks. */
  nudgeEnergyStep: 0.2,
  nudgePicks: 3,
  maxEnergyBias: 0.4,

  /** Songs within this fraction of target BPM match; half and double time count. */
  bpmTolerance: 0.08,
  /** Never repeat any of the last N songs played on a device. */
  recentExclude: 20,
  /** Final score = similarity * w.similarity + energy closeness * w.energy + valence closeness * w.valence. */
  weights: { similarity: 0.45, energy: 0.35, valence: 0.2 },
  /** Pick at random from the top K, so repeat walks do not sound identical. */
  topK: 5,
  /** Vector search pool size when there is no BPM filter (Convex maximum is 256). */
  vectorPool: 256,
  /** Fewer survivors than this triggers the fallback candidate pool. */
  minCandidates: 5,

  /** When the app switches songs. Read by the client playback engine. */
  playback: {
    /** Start the crossfade when the current preview has this much left. */
    previewTailMs: 3000,
    /** Ask for the next pick this long before the preview ends, so it is preloaded. */
    prefetchLeadMs: 9000,
    crossfadeMs: 2000,
    /** A sustained change in target energy larger than this triggers a new pick. */
    energyDelta: 0.25,
    /** How long the change must hold before it triggers. */
    sustainMs: 8000,
    /** Never cut a song off before it has played this long (skip and nudge excepted). */
    minPlayMs: 6000,
  },

  /** Client sensing. */
  sensing: {
    sampleMs: 5000,
    /** Cadence is smoothed over this window. */
    cadenceWindowMs: 10000,
  },

  /** Weather is cached per rounded coordinate cell for this long. */
  weatherCacheMs: 10 * 60 * 1000,
  weatherCellDegrees: 0.05,
  /** Give up on the weather API after this long and use a stale cache row, or `any`. */
  weatherTimeoutMs: 2500,

  // ---- Matching, server side (next:pick and the seeded friends) ----

  /** Cadence above this is treated as a sensor glitch and clamped. */
  maxCadenceSpm: 260,
  /**
   * The random pick only draws from top-K songs scoring within this much of the best,
   * so a thin pool never trades a good fit for variety. Set to 1 to draw from the whole top K.
   */
  topKScoreMargin: 0.06,
  /** Taken off the score of a half-time match when the user is running, so true-tempo songs win ties. */
  halfTimeRunPenalty: 0.03,
  /** Added to the score when the song's `timeOfDay` labels include the scene's time of day. */
  timeOfDayBonus: 0.04,
  /** Too few BPM matches: multiply `bpmTolerance` by this and read again, before the vector pool. */
  bpmWidenFactor: 2,
  /** Upper bound on songs read per BPM band (same, half and double time are one band each). */
  bandReadLimit: 700,
  /** Bounded read used instead of the vector pool when the scene has no embedding row. */
  fallbackScan: 256,
  /** How many ranked candidates the matching query returns: the top K plus spares for preview failures. */
  rankedReturn: 12,
  /** The client may send at most this many `excludeDeezerIds`. */
  maxClientExcludes: 200,
  /** The reason line is cut to this many characters. */
  reasonMaxChars: 60,

  /** Preview lookup. */
  preview: {
    /**
     * Where to ask for a preview URL, in order. Deezer answers HTTP 403 to Convex's
     * servers (measured Nov 15), so today every preview really comes from iTunes
     * and iTunes is asked first. Deezer stays as the fallback.
     */
    sources: ['itunes', 'deezer'],
    /** Per-request timeout. */
    timeoutMs: 2500,
    /** Candidates tried before giving up with `no_preview`. */
    maxCandidates: 3,
    /** Results requested from the iTunes Search API when Deezer has no preview. */
    itunesLimit: 5,
  },

  // ---- Soundtrack, feed and seeded friends ----

  /** A soundtrack shows at most this many entries (the newest ones). */
  ostMaxEntries: 300,
  /** In the summary line, a second mood this close to the first reads "a and b" instead of "mostly a". */
  summaryTieRatio: 0.75,
  feed: {
    /** Only plays this recent appear in the feed. */
    windowMs: 36 * 60 * 60 * 1000,
    maxPerProfile: 12,
    maxProfiles: 40,
    /** Non-seeded devices with this id prefix are cloud test devices and never appear. */
    testDevicePrefix: 'sim-',
    /** The seeded friends' deviceIds start with this. */
    seedDevicePrefix: 'seed-',
  },
  /** Entry titles: how long after the start of morning counts as "sunrise", and of afternoon as "midday". */
  titles: {
    sunriseHours: 3,
    middayHours: 2,
    maxPlaceChars: 40,
    /** A title, clock included, should fit one line: phrasings longer than this are passed over. */
    maxChars: 34,
    /** A new title avoids the lead and the ending of this many of the device's latest titles. */
    avoidRecent: 3,
  },

  /** Seeded friends live in this timezone (hours from UTC). */
  seedUtcOffsetHours: -8,
  /** A seeded friend gets a new play only when their latest one is older than this. */
  seedMinGapMs: 45 * 60 * 1000,
  /** Seeded plays older than this are pruned by the hourly cron. */
  seedPruneMs: 3 * 24 * 60 * 60 * 1000,
  /** First seeding: this many plays, taken from the friend's waking hours inside the window. */
  seedBackfillPlays: 8,
  seedBackfillWindowMs: 30 * 60 * 60 * 1000,
  /** Backfilled plays are this far apart, so a friend's day does not look like a metronome. */
  seedBackfillGapMs: { min: 35 * 60 * 1000, max: 75 * 60 * 1000 },
  /** A friend's newest play lands up to this long before the seeder ran, so friends do not tie. */
  seedJitterMs: 12 * 60 * 1000,
} as const;

export type Tuning = typeof TUNING;
