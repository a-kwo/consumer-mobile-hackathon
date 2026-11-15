/**
 * Soundtrack helpers shared by `ost:get` and `feed:list`: turning stored plays
 * into entries, and summarising a day by its moods. Pure.
 */
import type { Doc } from '../_generated/dataModel';
import { TUNING } from '../tuning';
import type { OstEntry } from './validators';

export function toOstEntry(play: Doc<'plays'>): OstEntry {
  return {
    playId: play._id,
    title: play.title,
    songTitle: play.songTitle,
    artist: play.artist,
    coverUrl: play.coverUrl,
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
