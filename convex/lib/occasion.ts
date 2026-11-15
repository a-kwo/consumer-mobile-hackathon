/**
 * Calendar occasions: what an upcoming event means for the music. Pure, and
 * shared: the app classifies event titles on the phone (so no calendar text
 * ever leaves it) and `buildScene` applies the shift on both sides.
 */
import { TUNING } from '../tuning';
import { OCCASIONS, type Occasion, type Setting } from './validators';

/** An occasion in play: which one, and whole minutes until it starts (zero or less once it has). */
export type ActiveOccasion = { id: Occasion; minutesUntil: number };

/** The parts of a calendar event that matter here. Times are epoch milliseconds. */
export type CalendarEvent = { title: string; startMs: number; endMs: number; allDay?: boolean };

/** A recognised event with its text gone: all that is kept of a calendar. */
export type OccasionEvent = { id: Occasion; startMs: number; endMs: number };

const MINUTE_MS = 60 * 1000;

const LABEL: Record<Occasion, string> = {
  game: 'Game',
  workout: 'Workout',
  focus: 'Focus',
  party: 'Party',
  travel: 'Travel',
  wind_down: 'Wind-down',
  date: 'Date',
};

/** "Game", "Wind-down": the occasion as a word for chips and pickers. */
export function occasionLabel(id: Occasion): string {
  return LABEL[id];
}

export function isOccasion(value: unknown): value is Occasion {
  return typeof value === 'string' && (OCCASIONS as readonly string[]).includes(value);
}

/** The occasion an event title points to, or null when no keyword is in it. */
export function classifyTitle(title: string): Occasion | null {
  const words = ` ${title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
  if (words.trim() === '') return null;
  for (const id of OCCASIONS) {
    if (TUNING.occasion.keywords[id].some((keyword) => words.includes(` ${keyword} `))) return id;
  }
  return null;
}

/**
 * How much of an occasion's shift applies: 0 outside the window, `rampFloor`
 * at `leadMinutes` out, rising to 1 at `peakMinutes` out and while it runs.
 */
export function occasionStrength(minutesUntil: number): number {
  const { leadMinutes, peakMinutes, rampFloor, maxEventMinutes } = TUNING.occasion;
  if (!Number.isFinite(minutesUntil)) return 0;
  if (minutesUntil > leadMinutes || minutesUntil < -maxEventMinutes) return 0;
  if (minutesUntil <= peakMinutes) return 1;
  const t = (leadMinutes - minutesUntil) / (leadMinutes - peakMinutes);
  return rampFloor + t * (1 - rampFloor);
}

export type OccasionEffect = {
  energy: number;
  valence: number;
  /** The setting to use when the scene has none of its own, or null. */
  setting: Setting | null;
  /** E.g. "Game in 45 min · building up". */
  line: string;
};

/** "Game in 45 min · building up", "Game in 8 min · at the peak", "Game underway". */
export function occasionLine(id: Occasion, minutesUntil: number): string {
  const minutes = Math.round(minutesUntil);
  if (minutes <= 0) return `${LABEL[id]} underway`;
  const { energy } = TUNING.occasion.shifts[id];
  const peak = occasionStrength(minutes) >= 1;
  let phase: string;
  if (energy > 0.1) phase = peak ? 'at the peak' : 'building up';
  else if (energy < -0.05) phase = peak ? 'settling in' : 'easing down';
  else phase = peak ? 'almost time' : 'setting the mood';
  return `${LABEL[id]} in ${minutes} min · ${phase}`;
}

/** What an occasion adds to the scene right now, or null when it is out of its window. */
export function occasionEffect(id: Occasion | null | undefined, minutesUntil: number | undefined): OccasionEffect | null {
  if (!isOccasion(id)) return null;
  const minutes = typeof minutesUntil === 'number' && Number.isFinite(minutesUntil) ? minutesUntil : 0;
  const strength = occasionStrength(minutes);
  if (strength <= 0) return null;
  const shift = TUNING.occasion.shifts[id];
  return {
    energy: shift.energy * strength,
    valence: shift.valence * strength,
    setting: strength >= 1 ? shift.setting : null,
    line: occasionLine(id, minutes),
  };
}

/**
 * Reduces calendar events to the recognised ones, dropping every title on the
 * way. All-day events, overlong ones and unknown titles produce nothing.
 */
export function occasionEventsFrom(events: readonly CalendarEvent[]): OccasionEvent[] {
  const found: OccasionEvent[] = [];
  for (const event of events) {
    if (event.allDay || !Number.isFinite(event.startMs) || !Number.isFinite(event.endMs)) continue;
    const length = event.endMs - event.startMs;
    if (length < 0 || length > TUNING.occasion.maxEventMinutes * MINUTE_MS) continue;
    const id = classifyTitle(event.title);
    if (id) found.push({ id, startMs: event.startMs, endMs: event.endMs });
  }
  return found;
}

/**
 * The occasion to score for at `nowMs`: among events that are running or start
 * within the lead window, the one whose shift is strongest, and of equally
 * strong ones the one that starts last (the event about to begin takes over
 * from the one that is ending). Null when there is none.
 */
export function nextOccasion(events: readonly OccasionEvent[], nowMs: number): ActiveOccasion | null {
  let best: { event: OccasionEvent; minutesUntil: number; strength: number } | null = null;
  for (const event of events) {
    if (event.endMs <= nowMs) continue;
    const minutesUntil = Math.ceil((event.startMs - nowMs) / MINUTE_MS);
    const strength = occasionStrength(minutesUntil);
    if (strength <= 0) continue;
    if (!best || strength > best.strength || (strength === best.strength && event.startMs > best.event.startMs)) {
      best = { event, minutesUntil, strength };
    }
  }
  return best ? { id: best.event.id, minutesUntil: best.minutesUntil } : null;
}
