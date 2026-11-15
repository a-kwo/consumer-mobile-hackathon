/**
 * Scene to song: the ranking rules, as pure functions. `next:pick` and the seeded
 * friends both go through here, so they can never disagree. No database access,
 * no randomness: the caller reads the songs and makes the random pick.
 */
import { type Infer, v } from 'convex/values';

import { TUNING } from '../tuning';
import { type Nudge, type Scene, timeOfDayV } from './validators';

/** What ranking needs to know about the moment. */
export const matchTargetV = v.object({
  /** Key of the scene's row in `scenes`, where its embedding lives. */
  sceneKey: v.string(),
  energy: v.number(),
  valence: v.number(),
  /** Target BPM, or null when still. */
  bpm: v.union(v.number(), v.null()),
  timeOfDay: timeOfDayV,
});
export type MatchTarget = Infer<typeof matchTargetV>;

/** A ranked song, without its embedding and without a preview URL. */
export const candidateV = v.object({
  deezerId: v.number(),
  title: v.string(),
  artist: v.string(),
  coverUrl: v.string(),
  bpm: v.number(),
  energy: v.number(),
  valence: v.number(),
  moods: v.array(v.string()),
  /** For the preview lookup, when the library has it. */
  itunesTrackId: v.optional(v.number()),
  /** Cosine similarity to the scene embedding, 0 when the scene has none. */
  similarity: v.number(),
  score: v.number(),
});
export type Candidate = Infer<typeof candidateV>;

/** The fields of a `songs` row that ranking reads. */
export type SongFeatures = {
  deezerId: number;
  title: string;
  artist: string;
  coverUrl: string;
  bpm: number;
  energy: number;
  valence: number;
  moods: string[];
  timeOfDay: string[];
  embedding: number[];
  itunesTrackId?: number;
};

export function targetForScene(scene: Scene): MatchTarget {
  return {
    sceneKey: scene.key,
    energy: scene.energy,
    valence: scene.valence,
    bpm: scene.bpm,
    timeOfDay: scene.timeOfDay,
  };
}

export type BpmRelation = 'same' | 'half' | 'double';
export type BpmBand = { relation: BpmRelation; min: number; max: number };

/** The BPM ranges that count as matching a stride: on the beat, half time and double time. */
export function bpmBands(targetBpm: number, tolerance: number): BpmBand[] {
  const band = (relation: BpmRelation, centre: number): BpmBand => ({
    relation,
    min: centre * (1 - tolerance),
    max: centre * (1 + tolerance),
  });
  return [band('same', targetBpm), band('half', targetBpm / 2), band('double', targetBpm * 2)];
}

/** How a song's tempo relates to the stride, or null when it does not. */
export function bpmRelationFor(songBpm: number, targetBpm: number | null, tolerance: number): BpmRelation | null {
  if (targetBpm === null || !(targetBpm > 0)) return null;
  for (const band of bpmBands(targetBpm, tolerance)) {
    if (songBpm >= band.min && songBpm <= band.max) return band.relation;
  }
  return null;
}

function norm(vector: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < vector.length; i++) sum += vector[i] * vector[i];
  return Math.sqrt(sum);
}

/** Cosine similarity. 0 when either vector is missing, empty or a different length. */
export function cosine(a: readonly number[], b: readonly number[], normA = norm(a), normB = norm(b)): number {
  if (a.length === 0 || a.length !== b.length || normA === 0 || normB === 0) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot / (normA * normB);
}

const closeness = (a: number, b: number) => 1 - Math.min(1, Math.abs(a - b));

/**
 * Scores and sorts songs for a scene, best first. Songs in `exclude` are dropped,
 * and so are duplicate deezerIds. `sceneVector` is null when the scene has no
 * embedding row yet: similarity is then 0 and energy and valence decide.
 */
export function rankSongs(
  songs: readonly SongFeatures[],
  target: MatchTarget,
  sceneVector: readonly number[] | null,
  exclude: ReadonlySet<number>,
): Candidate[] {
  const { weights, timeOfDayBonus } = TUNING;
  const sceneNorm = sceneVector ? norm(sceneVector) : 0;
  const seen = new Set<number>();
  const ranked: Candidate[] = [];

  for (const song of songs) {
    if (exclude.has(song.deezerId) || seen.has(song.deezerId)) continue;
    seen.add(song.deezerId);
    const similarity = sceneVector ? cosine(song.embedding, sceneVector, undefined, sceneNorm) : 0;
    const score =
      similarity * weights.similarity +
      closeness(song.energy, target.energy) * weights.energy +
      closeness(song.valence, target.valence) * weights.valence +
      (song.timeOfDay.includes(target.timeOfDay) ? timeOfDayBonus : 0);
    ranked.push({
      deezerId: song.deezerId,
      title: song.title,
      artist: song.artist,
      coverUrl: song.coverUrl,
      bpm: song.bpm,
      energy: song.energy,
      valence: song.valence,
      moods: song.moods,
      ...(song.itunesTrackId === undefined ? {} : { itunesTrackId: song.itunesTrackId }),
      similarity,
      score,
    });
  }

  // The deezerId tie-break keeps the order deterministic, as queries must be.
  return ranked.sort((a, b) => b.score - a.score || a.deezerId - b.deezerId);
}

/** `first`, then every candidate of `rest` not already in it. */
export function mergeRanked(first: readonly Candidate[], rest: readonly Candidate[]): Candidate[] {
  const seen = new Set(first.map((candidate) => candidate.deezerId));
  return [...first, ...rest.filter((candidate) => !seen.has(candidate.deezerId))];
}

/**
 * The order in which to try candidates: one drawn at `random` from the top K,
 * then the rest best first, `attempts` in total. A top-K candidate scoring more
 * than `topKScoreMargin` below the best is not drawn: with a thin pool, variety
 * must not cost a clearly worse fit.
 */
export function pickOrder(ranked: readonly Candidate[], random: number, attempts: number): Candidate[] {
  if (ranked.length === 0) return [];
  const head = ranked.slice(0, TUNING.topK);
  const best = Math.max(...head.map((candidate) => candidate.score));
  const eligible = head.filter((candidate) => candidate.score >= best - TUNING.topKScoreMargin);
  const chosen = eligible[Math.min(eligible.length - 1, Math.floor(random * eligible.length))];
  const order = [chosen, ...ranked.filter((candidate) => candidate !== chosen)];
  return order.slice(0, Math.max(1, attempts));
}

// ---- The reason line ----

const WEATHER_WORD: Record<Scene['weather'], string> = {
  any: '',
  clear: 'clear',
  cloudy: 'cloudy',
  fog: 'foggy',
  rain: 'rainy',
  snow: 'snowy',
  storm: 'stormy',
};

const TIME_WORD: Record<Scene['timeOfDay'], string> = {
  morning: 'morning',
  afternoon: 'afternoon',
  evening: 'evening',
  night: 'late night',
};

const words = (...parts: string[]) => parts.filter(Boolean).join(' ');

function weatherWord(scene: Scene): string {
  const daylight = scene.timeOfDay === 'morning' || scene.timeOfDay === 'afternoon';
  return scene.weather === 'clear' && daylight ? 'sunny' : WEATHER_WORD[scene.weather];
}

/** "calm and warm", or a fallback from the song's energy when it has no mood labels. */
function moodPhrase(candidate: Candidate): string {
  const moods = candidate.moods.slice(0, 2);
  if (moods.length > 0) return moods.join(' and ');
  if (candidate.energy < 0.4) return 'calm';
  return candidate.energy > 0.7 ? 'high energy' : 'easygoing';
}

/**
 * One short line a listener can check against what they hear, such as
 * "104 BPM matches your stride · rainy, late night".
 */
export function reasonFor(candidate: Candidate, scene: Scene, nudge?: Nudge): string {
  const bpm = Math.round(candidate.bpm);
  const weather = weatherWord(scene);
  const moment = [weather, TIME_WORD[scene.timeOfDay]].filter(Boolean).join(', ');

  let head: string;
  let tail = moment;
  if (nudge === 'calmer' || nudge === 'more_energy') {
    head = nudge === 'calmer' ? 'you asked for calmer' : 'you asked for more energy';
    tail = `${bpm} BPM`;
  } else {
    const exact = bpmRelationFor(candidate.bpm, scene.bpm, TUNING.bpmTolerance);
    const near = exact ?? bpmRelationFor(candidate.bpm, scene.bpm, TUNING.bpmTolerance * TUNING.bpmWidenFactor);
    if (exact === 'same') head = `${bpm} BPM matches your stride`;
    else if (exact === 'half') head = `${bpm} BPM, half-time to your stride`;
    else if (exact === 'double') head = `${bpm} BPM, double-time to your stride`;
    else if (near) head = `${bpm} BPM, close to your stride`;
    else if (scene.pace === 'still') {
      // The time of day is already in the head, so there is no tail.
      const time = scene.timeOfDay === 'night' ? 'night' : scene.timeOfDay;
      head = `${moodPhrase(candidate)} for a ${words('quiet', weather, time)}`;
      tail = '';
    } else {
      head = `${moodPhrase(candidate)} for your ${words(weather, scene.pace === 'run' ? 'run' : 'walk')}`;
      tail = TIME_WORD[scene.timeOfDay];
    }
  }

  const max = TUNING.reasonMaxChars;
  const full = tail ? `${head} · ${tail}` : head;
  if (full.length <= max) return full;
  return head.length <= max ? head : `${head.slice(0, max - 1).trimEnd()}…`;
}
