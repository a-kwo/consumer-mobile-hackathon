import type { OstEntry, ReplayItem } from '@/lib/score';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** Local midnight at the start of the day that contains `ms`. */
export function startOfLocalDay(ms: number): number {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** Local midnight `days` days from `dayStart`. Calendar arithmetic, so daylight-saving days are safe. */
export function addDays(dayStart: number, days: number): number {
  const date = new Date(dayStart);
  date.setDate(date.getDate() + days);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** `2026-11-15`, in local time. Used in replay list ids. */
export function dayKey(dayStart: number): string {
  const date = new Date(dayStart);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** "Sunday, November 15". */
export function formatLongDate(dayStart: number): string {
  const date = new Date(dayStart);
  return `${WEEKDAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

/** "6:12 PM", in local time. */
export function formatClock(ms: number): string {
  const date = new Date(ms);
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours % 12 === 0 ? 12 : hours % 12}:${minutes} ${hours < 12 ? 'AM' : 'PM'}`;
}

/** "Today", "Yesterday" or "3 days ago" for a day relative to today. */
export function relativeDayLabel(dayStart: number, today: number): string {
  const days = Math.round((today - dayStart) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}

/** "just now", "12 min ago", "3 h ago", "yesterday", "2 days ago". */
export function formatRelativeTime(ms: number, now: number): string {
  const minutes = Math.floor((now - ms) / 60_000);
  if (minutes < 2) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (startOfLocalDay(ms) === startOfLocalDay(now)) return `${Math.floor(minutes / 60)} h ago`;
  const days = Math.round((startOfLocalDay(now) - startOfLocalDay(ms)) / 86_400_000);
  return days <= 1 ? 'yesterday' : `${days} days ago`;
}

/** "1 cue", "9 cues". */
export function cueCount(count: number): string {
  return `${count} ${count === 1 ? 'cue' : 'cues'}`;
}

/** "07": the cue number as it appears on a tracklist. */
export function cueNumber(index: number): string {
  return String(index + 1).padStart(2, '0');
}

/** Soundtrack entries as a replay list. Songs without a preview are skipped by the engine. */
export function toReplayItems(entries: readonly OstEntry[]): ReplayItem[] {
  return entries.map((entry) => ({
    deezerId: entry.deezerId,
    title: entry.songTitle,
    artist: entry.artist,
    coverUrl: entry.coverUrl,
    subtitle: entry.title,
  }));
}

/** Up to four distinct covers, newest first, for a mosaic. */
export function mosaicCovers(entries: readonly OstEntry[]): string[] {
  const covers: string[] = [];
  for (let index = entries.length - 1; index >= 0 && covers.length < 4; index -= 1) {
    const url = entries[index].coverUrl;
    if (url && !covers.includes(url)) covers.push(url);
  }
  return covers;
}
