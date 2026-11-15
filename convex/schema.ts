import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

import { playContextV } from './lib/validators';

/** Must equal shared/vocab.json `embedding.dimensions`. */
export const EMBEDDING_DIMENSIONS = 384;

export default defineSchema({
  /**
   * The pre-labeled song library, built offline by pipeline/ and imported with
   * `npx convex import --replace`. A re-import changes every `_id`, so nothing
   * outside this table may reference a song by `_id`: use `deezerId`.
   */
  songs: defineTable({
    deezerId: v.number(),
    isrc: v.optional(v.string()),
    title: v.string(),
    artist: v.string(),
    album: v.optional(v.string()),
    /** Stable Deezer CDN image URL. Safe to store, unlike preview URLs. */
    coverUrl: v.string(),
    /**
     * Optional. The song's track id in the iTunes Store. Deezer refuses requests
     * from Convex's servers, so previews usually come from iTunes: with this id
     * the lookup is exact, without it the server searches by artist and title.
     */
    itunesTrackId: v.optional(v.number()),
    bpm: v.number(),
    energy: v.number(),
    valence: v.number(),
    tension: v.number(),
    /** From the fixed mood vocabulary in shared/vocab.json. */
    moods: v.array(v.string()),
    /** From the fixed scene-tag vocabulary in shared/vocab.json. */
    scenes: v.array(v.string()),
    /** Time-of-day ids from shared/vocab.json. */
    timeOfDay: v.array(v.string()),
    /** 0 = solitary listening, 1 = made for a crowd. */
    social: v.number(),
    /** 0 = instrumental, 1 = vocal-forward. */
    vocal: v.number(),
    confidence: v.number(),
    embedding: v.array(v.float64()),
  })
    .index('by_deezerId', ['deezerId'])
    .index('by_bpm', ['bpm'])
    .vectorIndex('by_embedding', {
      vectorField: 'embedding',
      dimensions: EMBEDDING_DIMENSIONS,
    }),

  /** One precomputed embedding per possible scene key, so picking never calls a model. */
  scenes: defineTable({
    /** `pace|weather|timeOfDay|setting` */
    key: v.string(),
    /** The sentence that was embedded, kept for debugging. */
    text: v.string(),
    embedding: v.array(v.float64()),
  }).index('by_key', ['key']),

  /** The play log. Song details are copied in, so the log survives a library re-import. */
  plays: defineTable({
    deviceId: v.string(),
    deezerId: v.number(),
    songTitle: v.string(),
    artist: v.string(),
    coverUrl: v.string(),
    bpm: v.number(),
    moods: v.array(v.string()),
    startedAt: v.number(),
    context: playContextV,
    sceneKey: v.string(),
    sceneLabel: v.string(),
    reason: v.string(),
    /** Generated at log time, e.g. "Rain on 4th Street, 6:12pm". */
    title: v.string(),
    skipped: v.boolean(),
  })
    .index('by_device_startedAt', ['deviceId', 'startedAt'])
    /** For tracks:preview, which may need the names of a song that has left the library. */
    .index('by_deezerId', ['deezerId']),

  profiles: defineTable({
    deviceId: v.string(),
    displayName: v.string(),
    avatarEmoji: v.string(),
    /** True for the fake friends created by seed:friends. */
    seeded: v.boolean(),
  }).index('by_deviceId', ['deviceId']),

  weatherCache: defineTable({
    /** Rounded "lat,lon" cell. */
    cell: v.string(),
    weather: v.string(),
    temperatureC: v.union(v.number(), v.null()),
    fetchedAt: v.number(),
  }).index('by_cell', ['cell']),
});
