/**
 * Candidate gathering for a scene. `next:pick` and the seeded friends both call
 * `findCandidates`; the ranking rules themselves are pure and live in lib/match.ts.
 *
 * Moving: one query reads the BPM bands and ranks them. Still (or too few BPM
 * matches): the action runs a vector search and a second query ranks that pool.
 */
import { v } from 'convex/values';

import { internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { type ActionCtx, type QueryCtx, internalQuery } from './_generated/server';
import {
  type Candidate,
  type MatchTarget,
  bpmBands,
  candidateV,
  matchTargetV,
  mergeRanked,
  rankSongs,
  targetForScene,
} from './lib/match';
import type { Scene } from './lib/validators';
import { TUNING } from './tuning';

async function sceneVector(ctx: QueryCtx, sceneKey: string): Promise<number[] | null> {
  const row = await ctx.db
    .query('scenes')
    .withIndex('by_key', (q) => q.eq('key', sceneKey))
    .first();
  return row && row.embedding.length > 0 ? row.embedding : null;
}

/** Every song whose tempo fits the stride: on the beat, half time or double time. */
async function readBpmBands(ctx: QueryCtx, targetBpm: number, tolerance: number): Promise<Doc<'songs'>[]> {
  const bands = await Promise.all(
    bpmBands(targetBpm, tolerance).map((band) =>
      ctx.db
        .query('songs')
        .withIndex('by_bpm', (q) => q.gte('bpm', band.min).lte('bpm', band.max))
        .take(TUNING.bandReadLimit),
    ),
  );
  return bands.flat();
}

const top = (ranked: Candidate[]) => ranked.slice(0, TUNING.rankedReturn);

/**
 * First step of a pick. Reads the scene embedding, the device's recent plays and
 * (when moving) the BPM-matched songs in parallel, and ranks what it finds.
 * When that is not enough it hands back `poolVector` for a vector search.
 */
export const prepare = internalQuery({
  args: { deviceId: v.string(), target: matchTargetV, excludeDeezerIds: v.array(v.number()) },
  returns: v.object({
    ranked: v.array(candidateV),
    /** Set when `ranked` is too thin: the scene embedding to run the vector search with. */
    poolVector: v.union(v.array(v.float64()), v.null()),
    /** Recent plays plus the client's own exclusions, for the follow-up query. */
    exclude: v.array(v.number()),
    /** True when the bounded read stood in for the vector pool. */
    scanned: v.boolean(),
  }),
  handler: async (ctx, { deviceId, target, excludeDeezerIds }) => {
    const { bpmTolerance, bpmWidenFactor, minCandidates } = TUNING;
    const [vector, recent, matched] = await Promise.all([
      sceneVector(ctx, target.sceneKey),
      ctx.db
        .query('plays')
        .withIndex('by_device_startedAt', (q) => q.eq('deviceId', deviceId))
        .order('desc')
        .take(TUNING.recentExclude),
      target.bpm === null ? [] : readBpmBands(ctx, target.bpm, bpmTolerance),
    ]);
    const exclude = new Set([...recent.map((play) => play.deezerId), ...excludeDeezerIds]);
    const done = (ranked: Candidate[], poolVector: number[] | null = null, scanned = false) => ({
      ranked: top(ranked),
      poolVector,
      exclude: [...exclude],
      scanned,
    });

    let ranked = rankSongs(matched, target, vector, exclude);
    if (target.bpm !== null && ranked.length < minCandidates) {
      const widened = await readBpmBands(ctx, target.bpm, bpmTolerance * bpmWidenFactor);
      ranked = rankSongs(widened, target, vector, exclude);
    }
    if (ranked.length >= minCandidates) return done(ranked);
    if (vector) return done(ranked, vector);

    // No embedding for this scene yet: a bounded read, ranked on energy and valence alone.
    const scan = await ctx.db.query('songs').take(TUNING.fallbackScan);
    return done(mergeRanked(ranked, rankSongs(scan, target, null, exclude)), null, true);
  },
});

/** Ranks the songs a vector search returned. */
export const rankByIds = internalQuery({
  args: { ids: v.array(v.id('songs')), target: matchTargetV, exclude: v.array(v.number()) },
  returns: v.array(candidateV),
  handler: async (ctx, { ids, target, exclude }) => {
    const [vector, songs] = await Promise.all([
      sceneVector(ctx, target.sceneKey),
      Promise.all(ids.map((id) => ctx.db.get('songs', id))),
    ]);
    const found = songs.filter((song): song is Doc<'songs'> => song !== null);
    return top(rankSongs(found, target, vector, new Set(exclude)));
  },
});

/** Last resort when everything else was excluded: a bounded read of any songs. */
export const rankAny = internalQuery({
  args: { target: matchTargetV, exclude: v.array(v.number()) },
  returns: v.array(candidateV),
  handler: async (ctx, { target, exclude }) => {
    const [vector, songs] = await Promise.all([
      sceneVector(ctx, target.sceneKey),
      ctx.db.query('songs').take(TUNING.fallbackScan),
    ]);
    return top(rankSongs(songs, target, vector, new Set(exclude)));
  },
});

export type FindResult = {
  /** True when there are no songs to pick from at all. */
  libraryEmpty: boolean;
  /** Best first. Empty only when the library is empty. */
  ranked: Candidate[];
  /** Which pool the candidates came from, for logs. */
  pool: 'bpm' | 'bpm+vector' | 'vector' | 'scan' | 'relaxed';
};

/**
 * Ranked candidates for a scene, never an empty list unless the library is
 * empty: BPM matches first, then the vector pool, then any songs with the
 * exclusions relaxed. The caller makes the random pick.
 */
export async function findCandidates(
  ctx: ActionCtx,
  args: { deviceId: string; scene: Scene; excludeDeezerIds: number[] },
): Promise<FindResult> {
  const target: MatchTarget = targetForScene(args.scene);
  const prepared: {
    ranked: Candidate[];
    poolVector: number[] | null;
    exclude: number[];
    scanned: boolean;
  } = await ctx.runQuery(internal.match.prepare, {
    deviceId: args.deviceId,
    target,
    excludeDeezerIds: args.excludeDeezerIds,
  });
  let ranked = prepared.ranked;
  let pool: FindResult['pool'] = prepared.scanned ? 'scan' : 'bpm';
  if (prepared.poolVector) {
    const hits = await ctx.vectorSearch('songs', 'by_embedding', {
      vector: prepared.poolVector,
      limit: TUNING.vectorPool,
    });
    const fromPool: Candidate[] =
      hits.length === 0
        ? []
        : await ctx.runQuery(internal.match.rankByIds, {
            ids: hits.map((hit) => hit._id),
            target,
            exclude: prepared.exclude,
          });
    pool = ranked.length > 0 ? 'bpm+vector' : 'vector';
    ranked = mergeRanked(ranked, fromPool);
  }

  // A tiny library can be excluded entirely. Repeating a recent song beats silence:
  // first forget the play history, then even the songs the client holds.
  for (const exclude of [args.excludeDeezerIds, []]) {
    if (ranked.length > 0) break;
    ranked = await ctx.runQuery(internal.match.rankAny, { target, exclude });
    pool = 'relaxed';
  }
  // Nothing at all, with nothing excluded: there are no songs. Found out this way,
  // and not by reading a song up front, so the usual pick does not pay for the check.
  return { libraryEmpty: ranked.length === 0, ranked, pool };
}
