/**
 * Soundtrack helpers shared by `ost:get` and `feed:list`: turning stored plays
 * into entries, summarising a day by its moods, and the rules for the day a
 * phone names when it edits a soundtrack. Pure.
 */
import type { Doc } from '../_generated/dataModel';
import { TUNING } from '../tuning';
import { makeTitle } from './titles';
import type { OstEntry } from './validators';

export function toOstEntry(play: Doc<'plays'>): OstEntry {
  return {
    playId: play._id,
    title: play.title,
    songTitle: play.songTitle,
    artist: play.artist,
    coverUrl: play.coverUrl,
    ...(play.coverColor === undefined ? {} : { coverColor: play.coverColor }),
    deezerId: play.deezerId,
    bpm: play.bpm,
    moods: play.moods,
    sceneLabel: play.sceneLabel,
    reason: play.reason,
    startedAt: play.startedAt,
    weather: play.context.weather,
    localHour: play.context.localHour,
  };
}

/**
 * The entry title other people see when the soundtrack hides its places. A
 * play with a place name gets the title it would have had without one, so
 * "Rain on Valencia Street, 6:12pm" becomes something like "Rain in the city,
 * 6:12pm"; a play that never had a place name keeps its title.
 */
export function publicTitle(play: Doc<'plays'>): string {
  if (!play.context.placeName) return play.title;
  return makeTitle({ ...play.context, placeName: undefined }, play.deezerId, play.startedAt, { mood: play.moods[0] });
}

/** A soundtrack's own title, trimmed and bounded. Null when nothing usable is left, which clears it. */
export function cleanOstTitle(title: string): string | null {
  const cleaned = Array.from(title.replace(/\s+/g, ' ').trim()).slice(0, TUNING.share.maxTitleChars).join('').trim();
  return cleaned || null;
}

export type LocalDay = { date: string; dayStart: number; dayEnd: number };

/**
 * True when `date` is a calendar date and the two midnights could be that
 * date's in some timezone: about a day apart, and starting within the range
 * of UTC offsets (-12 to +14 hours) of the date's UTC midnight.
 */
export function isLocalDay({ date, dayStart, dayEnd }: LocalDay): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const utcMidnight = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(utcMidnight) || !Number.isFinite(dayStart) || !Number.isFinite(dayEnd)) return false;
  const length = dayEnd - dayStart;
  const hour = 60 * 60 * 1000;
  return (
    length >= TUNING.share.dayMs.min &&
    length <= TUNING.share.dayMs.max &&
    dayStart >= utcMidnight - 14 * hour &&
    dayStart <= utcMidnight + 12 * hour
  );
}

/**
 * The cue a photo belongs to: the latest one that started at or before
 * `takenAt` and no longer than `photoCueWindowMs` before it. Null when the
 * photo was taken outside any cue.
 */
export function cueAt<Play extends { startedAt: number }>(plays: readonly Play[], takenAt: number): Play | null {
  let found: Play | null = null;
  for (const play of plays) {
    if (play.startedAt > takenAt || takenAt - play.startedAt > TUNING.share.photoCueWindowMs) continue;
    if (!found || play.startedAt > found.startedAt) found = play;
  }
  return found;
}

/**
 * Up to three moods, most common first (ties keep the order they first appeared
 * in), and one line such as "mostly reflective, a little hopeful". The summary
 * is empty when there is nothing to summarise.
 */
export function summarizeMoods(entries: readonly { moods: readonly string[] }[]): {
  topMoods: string[];
  summary: string;
} {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    for (const mood of entry.moods) counts.set(mood, (counts.get(mood) ?? 0) + 1);
  }
  // Map keeps insertion order and the sort is stable, so ties stay in first-seen order.
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const topMoods = sorted.slice(0, 3).map(([mood]) => mood);
  if (sorted.length === 0) return { topMoods, summary: '' };

  const [first, second, third] = sorted;
  if (!second) return { topMoods, summary: `mostly ${first[0]}` };
  if (second[1] >= first[1] * TUNING.summaryTieRatio) {
    const pair = `${first[0]} and ${second[0]}`;
    return { topMoods, summary: third ? `${pair}, a little ${third[0]}` : pair };
  }
  return { topMoods, summary: `mostly ${first[0]}, a little ${second[0]}` };
}
