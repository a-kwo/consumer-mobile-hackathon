/**
 * The passage on the Scene screen: the moment, told back to the user in a few
 * sentences, the way liner notes might put it.
 *
 *   You're on 5th Avenue, in New York.
 *   The sun is out, and it's seven degrees.
 *   It's Sunday afternoon, a little before four.
 *   You have a date in forty minutes,
 *   and you're walking at an easy, steady pace.
 *   So we'll begin with Break My Stride.
 *
 * Every clause is built from the real values (place parts, weather and
 * temperature, the clock, the next event, the cadence), never from a canned
 * string per scenario. Pure: no React, safe to run in Node.
 *
 * A clause is a list of parts. `strong` parts are the findings and carry the
 * weight on screen; the rest are the quieter connective words.
 */
import { paceFor, normalizeHour, timeOfDayFor } from '../../../convex/lib/scene';
import type { Occasion, Setting, Weather } from '../../../convex/lib/validators';

export type Part = { text: string; strong?: boolean };

export type PassagePlace = {
  label: string;
  street: string | null;
  area: string | null;
  city: string | null;
  setting: Setting;
};

const quiet = (text: string): Part => ({ text });
const strong = (text: string): Part => ({ text, strong: true });

/** The clause as plain text, for accessibility labels and change detection. */
export function clauseText(parts: readonly Part[]): string {
  return parts.map((part) => part.text).join('');
}

// ------------------------------------------------------------------ numbers

const ONES = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

/** Whole numbers under one hundred in words ("forty-two"); anything larger stays in digits. */
export function numberWord(value: number): string {
  const n = Math.round(Math.abs(value));
  if (n >= 100) return String(n);
  if (n < 20) return ONES[n];
  const unit = n % 10;
  return unit === 0 ? TENS[Math.floor(n / 10)] : `${TENS[Math.floor(n / 10)]}-${ONES[unit]}`;
}

// -------------------------------------------------------------------- place

/** Kinds of place one is "at" rather than "in". */
const AT_SETTINGS: ReadonlySet<Setting> = new Set<Setting>(['gym', 'indoors', 'transit']);

/**
 * "You're on 5th Avenue, in New York." / "You're in Shibuya, Tokyo." /
 * "You're at home." With no place at all, `setting` and a bare `placeName`
 * are what is left to go on.
 */
export function placeClause(
  place: PassagePlace | null,
  fallback: { setting: Setting; placeName?: string | null }
): Part[] {
  if (!place) {
    const name = fallback.placeName?.trim();
    if (fallback.setting === 'indoors' || name?.toLowerCase() === 'home') {
      return [quiet('You’re '), strong('at home'), quiet('.')];
    }
    if (name) return [quiet('You’re near '), strong(name), quiet('.')];
    if (fallback.setting === 'gym') return [quiet('You’re '), strong('at the gym'), quiet('.')];
    return [quiet('You’re '), strong('somewhere without a name'), quiet('.')];
  }
  const { street, area, city } = place;
  if (street) {
    return city && city !== street
      ? [quiet('You’re on '), strong(street), quiet(', in '), strong(city), quiet('.')]
      : [quiet('You’re on '), strong(street), quiet('.')];
  }
  const at = AT_SETTINGS.has(place.setting);
  if (area) {
    if (!city || city === area) return [quiet(at ? 'You’re at ' : 'You’re in '), strong(area), quiet('.')];
    return at
      ? [quiet('You’re at '), strong(area), quiet(', in '), strong(city), quiet('.')]
      : [quiet('You’re in '), strong(area), quiet(', '), strong(city), quiet('.')];
  }
  if (city) return [quiet('You’re in '), strong(city), quiet('.')];
  return [quiet('You’re at '), strong(place.label), quiet('.')];
}

// ------------------------------------------------------------------ weather

function skyPhrase(weather: Weather, daylight: boolean): { lead: string; finding: string; tail: string } | null {
  switch (weather) {
    case 'clear':
      return daylight
        ? { lead: 'The ', finding: 'sun is out', tail: '' }
        : { lead: 'The ', finding: 'sky is clear', tail: '' };
    case 'cloudy':
      return { lead: 'It’s ', finding: 'overcast', tail: '' };
    case 'fog':
      return { lead: 'There’s ', finding: 'fog', tail: ' in the air' };
    case 'rain':
      return { lead: '', finding: 'Rain', tail: ' is falling' };
    case 'snow':
      return { lead: '', finding: 'Snow', tail: ' is falling' };
    case 'storm':
      return { lead: 'A ', finding: 'storm', tail: ' is overhead' };
    default:
      return null;
  }
}

function degrees(temperatureC: number): string {
  const rounded = Math.round(temperatureC);
  const word = numberWord(rounded);
  const unit = Math.abs(rounded) === 1 ? 'degree' : 'degrees';
  return rounded < 0 ? `minus ${word} ${unit}` : `${word} ${unit}`;
}

/** "The sun is out, and it's seven degrees." / "Rain is falling." / "It's twelve degrees out." */
export function weatherClause(weather: Weather, temperatureC: number | null, localHour: number): Part[] {
  const part = timeOfDayFor(localHour);
  const sky = skyPhrase(weather, part === 'morning' || part === 'afternoon');
  const hasTemperature = typeof temperatureC === 'number' && Number.isFinite(temperatureC);
  if (!sky) {
    return hasTemperature
      ? [quiet('It’s '), strong(degrees(temperatureC)), quiet(' out.')]
      : [quiet('The weather is '), strong('keeping to itself'), quiet('.')];
  }
  const parts = [quiet(sky.lead), strong(sky.finding), quiet(sky.tail)].filter((p) => p.text !== '');
  if (hasTemperature) return [...parts, quiet(', and it’s '), strong(degrees(temperatureC)), quiet('.')];
  return [...parts, quiet('.')];
}

// --------------------------------------------------------------------- time

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function hourName(hour24: number): string {
  const hour = ((hour24 % 24) + 24) % 24;
  if (hour === 0) return 'midnight';
  if (hour === 12) return 'noon';
  return ONES[hour % 12];
}

/** The time as one would say it: "just before seven", "a little after nine", "half past two". */
export function timePhrase(localHour: number): string {
  const totalMinutes = Math.round(normalizeHour(localHour) * 60) % (24 * 60);
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  const here = hourName(hour);
  const next = hourName(hour + 1);
  const onTheHour = (name: string) => (name === 'noon' || name === 'midnight' ? name : `${name} o’clock`);

  if (minute <= 3) return onTheHour(here);
  if (minute <= 11) return `a little after ${here}`;
  if (minute <= 18) return `a quarter past ${here}`;
  if (minute <= 26) return `nearly half past ${here}`;
  if (minute <= 33) return `half past ${here}`;
  if (minute <= 41) return `a little after half past ${here}`;
  if (minute <= 48) return `a quarter to ${next}`;
  if (minute <= 56) return `a little before ${next}`;
  return `just before ${next}`;
}

/** "It's Sunday afternoon, a little before four." / "It's late on Friday night, half past eleven." */
export function timeClause(day: number, localHour: number): Part[] {
  const hour = normalizeHour(localHour);
  const name = DAYS[((Math.round(day) % 7) + 7) % 7];
  const part = timeOfDayFor(hour);
  let when: string;
  if (part !== 'night') when = `${name} ${part}`;
  else if (hour < 12) when = `the small hours of ${name}`;
  else when = `late on ${name} night`;
  return [quiet('It’s '), strong(when), quiet(', '), strong(timePhrase(hour)), quiet('.')];
}

// ----------------------------------------------------------------- calendar

/** "forty minutes", "about an hour", "a minute". Longer waits are rounded to five minutes. */
export function minutesPhrase(minutesUntil: number): string {
  const minutes = Math.round(minutesUntil);
  if (minutes <= 1) return 'a minute';
  if (minutes >= 55 && minutes <= 70) return 'about an hour';
  if (minutes > 70) return `about ${numberWord(Math.round(minutes / 60))} hours`;
  const shown = minutes >= 15 ? Math.round(minutes / 5) * 5 : minutes;
  return `${numberWord(shown)} minutes`;
}

const AHEAD: Record<Occasion, { lead: string; finding: string }> = {
  game: { lead: 'You have ', finding: 'a game' },
  workout: { lead: 'You have ', finding: 'a workout' },
  focus: { lead: 'You have ', finding: 'time set aside to focus' },
  party: { lead: 'You have ', finding: 'a party' },
  travel: { lead: 'You have ', finding: 'a journey' },
  wind_down: { lead: 'You’re due to ', finding: 'wind down' },
  date: { lead: 'You have ', finding: 'a date' },
};

const UNDERWAY: Record<Occasion, { lead: string; finding: string; tail: string }> = {
  game: { lead: 'Your ', finding: 'game', tail: ' is under way' },
  workout: { lead: 'You’re in the middle of ', finding: 'a workout', tail: '' },
  focus: { lead: 'It’s ', finding: 'time to focus', tail: '' },
  party: { lead: 'The ', finding: 'party', tail: ' has started' },
  travel: { lead: 'You’re ', finding: 'on your way', tail: '' },
  wind_down: { lead: 'It’s ', finding: 'time to wind down', tail: '' },
  date: { lead: 'Your ', finding: 'date', tail: ' has begun' },
};

/**
 * "You have a date in forty minutes," / "You're in the middle of a workout," /
 * "Nothing is waiting for you,". It ends on a comma: the pace clause finishes
 * the sentence.
 */
export function calendarClause(occasion: { id: Occasion; minutesUntil: number } | null): Part[] {
  if (!occasion || !(occasion.id in AHEAD)) {
    return [strong('Nothing is waiting'), quiet(' for you,')];
  }
  if (Math.round(occasion.minutesUntil) <= 0) {
    const now = UNDERWAY[occasion.id];
    return [quiet(now.lead), strong(now.finding), quiet(`${now.tail},`)];
  }
  const ahead = AHEAD[occasion.id];
  return [
    quiet(ahead.lead),
    strong(ahead.finding),
    quiet(' in '),
    strong(minutesPhrase(occasion.minutesUntil)),
    quiet(','),
  ];
}

// --------------------------------------------------------------------- pace

/** "and you're walking at an easy, steady pace." It finishes the calendar clause's sentence. */
export function paceClause(cadenceSpm: number): Part[] {
  switch (paceFor(cadenceSpm)) {
    case 'still':
      return [quiet('and you’re '), strong('standing still'), quiet('.')];
    case 'stroll':
      return [quiet('and you’re '), strong('walking slowly'), quiet('.')];
    case 'walk':
      return [quiet('and you’re walking at '), strong('an easy, steady pace'), quiet('.')];
    case 'brisk':
      return [quiet('and you’re '), strong('walking briskly'), quiet('.')];
    default:
      return [quiet('and you’re '), strong('running'), quiet('.')];
  }
}

// -------------------------------------------------------------------- music

/** The payoff: "So we'll begin with Break My Stride." */
export function songClause(title: string | null | undefined): Part[] {
  const name = title?.trim();
  return name
    ? [quiet('So we’ll begin with '), strong(name), quiet('.')]
    : [quiet('So '), strong('we’ll begin'), quiet('.')];
}
