/**
 * Titles for soundtrack entries, in the spirit of "Rain on 4th Street, 6:12pm".
 * Pure and deterministic: fixed templates, so a mutation can generate them.
 *
 * Each context has a pool of phrasings led by different things: the weather,
 * the pace, the time of day, the place, the setting or the song's first mood.
 * A hash of the play picks where in the pool to start, and phrasings that would
 * repeat the lead or the ending of the device's last few titles, or run past
 * one line, are passed over. So a day's tracklist does not read as one title.
 */
import { TUNING } from '../tuning';
import { hashString } from './hash';
import { normalizeHour, paceFor } from './scene';
import type { Pace, PlayContext, Setting, Weather } from './validators';

/** "6:12pm" from a local hour such as 18.2. */
export function formatClock(localHour: number): string {
  const minutes = Math.floor(normalizeHour(localHour) * 60 + 1e-6) % (24 * 60);
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${hour % 12 === 0 ? 12 : hour % 12}:${String(minute).padStart(2, '0')}${hour < 12 ? 'am' : 'pm'}`;
}

/** The part of the day, lower case: "sunrise", "morning", "midday", "afternoon", "evening", "late night". */
export function dayWord(localHour: number): string {
  const hour = normalizeHour(localHour);
  const start = TUNING.timeOfDayStartHour;
  if (hour >= start.night || hour < start.morning) return 'late night';
  if (hour < start.morning + TUNING.titles.sunriseHours) return 'sunrise';
  if (hour < start.afternoon) return 'morning';
  if (hour < start.afternoon + TUNING.titles.middayHours) return 'midday';
  if (hour < start.evening) return 'afternoon';
  return 'evening';
}

type Place = {
  /** "on Valencia Street", "in the park", "at home". */
  at: string;
  /** For movement: "down Valencia Street", "through the park". */
  through: string;
  indoors: boolean;
};

const SETTING_PLACE: Record<Setting, Place | null> = {
  any: null,
  city: { at: 'in the city', through: 'through the city', indoors: false },
  nature: { at: 'in the park', through: 'through the park', indoors: false },
  indoors: { at: 'at home', through: 'at home', indoors: true },
  transit: { at: 'on the train', through: 'on the train', indoors: true },
  gym: { at: 'at the gym', through: 'at the gym', indoors: true },
};

const STREET =
  /\b(street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr|way|court|ct|place|pl|terrace|highway|hwy|parkway|pkwy|broadway|alley|row|bridge|embarcadero|promenade|boardwalk|trail|path)\.?$/i;
/** Languages that put the kind of road first: "Rua Augusta", "Avenida Amsterdam". */
const STREET_FIRST = /^(rua|avenida|av\.|calle|rue|via|paseo|carrer|travessa)\s/i;
const AT_NOUN =
  /\b(home|work|office|caf[eé]|coffee shop|library|studio|gym|station|airport|market|school|campus|beach|bar|pool)$/i;

/** Trims a reverse-geocoded name to its first part: "Valencia St, San Francisco" becomes "Valencia St". */
export function cleanPlaceName(placeName: string | undefined): string | null {
  if (!placeName) return null;
  const first = placeName.split(',')[0].replace(/\s+/g, ' ').trim();
  if (!first) return null;
  return Array.from(first).slice(0, TUNING.titles.maxPlaceChars).join('').trim() || null;
}

function placeFor(context: PlayContext): Place | null {
  const name = cleanPlaceName(context.placeName);
  if (!name) return SETTING_PLACE[context.setting];
  const indoors = SETTING_PLACE[context.setting]?.indoors ?? false;
  if (/^(at )?home$/i.test(name)) return { at: 'at home', through: 'at home', indoors: true };
  if (STREET.test(name) || STREET_FIRST.test(name) || /^\d/.test(name)) return { at: `on ${name}`, through: `down ${name}`, indoors };
  if (AT_NOUN.test(name)) return { at: `at ${name}`, through: `at ${name}`, indoors: true };
  return { at: `in ${name}`, through: `through ${name}`, indoors };
}

type BadWeather = 'rain' | 'snow' | 'fog' | 'storm';
const isBadWeather = (weather: Weather): weather is BadWeather =>
  weather === 'rain' || weather === 'snow' || weather === 'fog' || weather === 'storm';

const WEATHER_WORDS: Record<
  BadWeather,
  { noun: string; adjective: string; indoors: string; waiting: string; moving: string[]; still: string[] }
> = {
  rain: {
    noun: 'rain',
    adjective: 'rainy',
    indoors: 'rain on the window',
    waiting: 'waiting out the rain',
    moving: ['wet pavement', 'umbrella weather', 'puddles and streetlights'],
    still: ['listening to the rain', 'grey light, soft rain'],
  },
  snow: {
    noun: 'snow',
    adjective: 'snowy',
    indoors: 'snow past the window',
    waiting: 'watching the snow fall',
    moving: ['fresh snow', 'footprints in the snow', 'first tracks'],
    still: ['snowed in', 'everything gone white'],
  },
  fog: {
    noun: 'fog',
    adjective: 'foggy',
    indoors: 'fog at the window',
    waiting: 'watching the fog roll in',
    moving: ['into the fog', 'streetlights in the fog', 'half the city missing'],
    still: ['fogged in', 'the city gone quiet'],
  },
  storm: {
    noun: 'storm',
    adjective: 'stormy',
    indoors: 'thunder outside',
    waiting: 'waiting out the storm',
    moving: ['racing the storm', 'under the thunder', 'wind at my back'],
    still: ['lights flickering', 'counting after lightning'],
  },
};

const PACE_WORDS: Record<Exclude<Pace, 'still'>, { noun: string; moving: string; out: string; extras: string[] }> = {
  stroll: { noun: 'stroll', moving: 'wandering', out: 'out for a wander', extras: ['no hurry', 'taking the long way'] },
  walk: { noun: 'walk', moving: 'walking', out: 'out walking', extras: ['in step', 'one more block'] },
  brisk: { noun: 'walk', moving: 'hurrying', out: 'on the move', extras: ['places to be', 'running late'] },
  run: { noun: 'run', moving: 'running', out: 'out for a run', extras: ['finding a rhythm', 'second wind', 'legs and lungs'] },
};

const STILL_EXTRAS: Record<Setting, string[]> = {
  any: ['a quiet moment', 'nowhere to be'],
  city: ['a pause in the city', 'watching the city'],
  nature: ['a pause in the park', 'under the trees'],
  indoors: ['a quiet moment at home', 'staying in', 'nowhere to be'],
  transit: ['window seat', 'between stations'],
  gym: ['between sets', 'catching my breath'],
};

const join = (...parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join(' ');
const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const article = (word: string) => (/^[aeiou]/i.test(word) ? 'an' : 'a');

/** Every phrasing that fits the context, with no duplicates. `mood` is the song's first mood. */
function variants(context: PlayContext, mood: string | undefined): string[] {
  const pace = paceFor(context.cadenceSpm);
  const day = dayWord(context.localHour);
  const place = placeFor(context);
  const moving = pace === 'still' ? null : PACE_WORDS[pace];
  const daylight = day === 'morning' || day === 'midday' || day === 'afternoon';
  const sky =
    context.weather === 'clear' ? (daylight ? 'sunny' : 'clear') : context.weather === 'cloudy' ? 'grey' : null;
  const pool: (string | null | false | undefined)[] = [];

  // Led by the mood of the song, whatever the weather.
  if (mood) {
    pool.push(join(mood, day));
    if (moving) pool.push(join(article(mood), mood, moving.noun));
    if (pace === 'run') pool.push(join(mood, 'miles'));
    if (place) pool.push(join(mood, place.at));
  }

  // Moving indoors (a treadmill) is not a walk in the rain, whatever the sky is doing.
  if (isBadWeather(context.weather) && !(moving && place?.indoors)) {
    const weather = WEATHER_WORDS[context.weather];
    if (moving) {
      pool.push(
        place && join(weather.noun, place.at),
        join(weather.adjective, day, moving.noun),
        join(moving.moving, 'through the', weather.noun),
        join('a', moving.noun, 'in the', weather.noun),
        join(day, moving.noun, place?.at),
        place && join(moving.moving, place.through),
        ...weather.moving,
      );
    } else {
      pool.push(
        place && !place.indoors ? join(weather.noun, place.at) : weather.indoors,
        join(weather.adjective, day, place?.at),
        weather.waiting,
        join(day, place?.at ?? 'indoors'),
        join('quiet', day),
        ...weather.still,
        ...STILL_EXTRAS[context.setting],
      );
    }
  } else if (moving) {
    const run = pace === 'run';
    pool.push(
      join(pace === 'brisk' && 'brisk', day, moving.noun, run ? place?.through : place?.at),
      place ? join(moving.moving, place.through) : moving.out,
      join(pace === 'stroll' ? 'a slow' : 'a', moving.noun, place?.at),
      sky && join(sky, moving.noun, place?.at),
      sky && join(sky, day, moving.noun),
      run && join(day, 'miles', place?.at),
      place && join(day, place.at),
      ...moving.extras,
    );
  } else {
    pool.push(
      place ? join(day, place.at) : join('quiet', day),
      join('quiet', day, place?.at),
      context.placeName && place && join('a pause', place.at),
      sky && join(sky, day),
      sky === 'sunny' && place?.indoors && 'sun through the window',
      ...STILL_EXTRAS[context.setting],
    );
  }
  return [...new Set(pool.filter((body): body is string => Boolean(body)))];
}

const words = (body: string) => body.toLowerCase().split(' ');
/** What a title opens with, ignoring a leading article: "a dreamy walk" leads with "dreamy". */
const lead = (body: string) => words(body).find((word) => !['a', 'an', 'the'].includes(word)) ?? '';
/** How a title closes: "through the rain", "on Valencia Street". */
const ending = (body: string) => words(body).slice(-2).join(' ');
/** A stored title without its clock: "Rain on 4th Street, 6:12pm" gives "Rain on 4th Street". */
const bodyOf = (title: string) => title.replace(/, \d{1,2}:\d{2}[ap]m$/, '');

export type TitleOptions = {
  /** The song's first mood, for mood-led phrasings. */
  mood?: string;
  /** The device's most recent titles, newest first. Their leads and endings are avoided. */
  recentTitles?: readonly string[];
};

/**
 * The title of one soundtrack entry, e.g. "Evening walk on Valencia Street, 6:12pm".
 * `deezerId` and `startedAt` choose where in the pool to start; the same play
 * after the same recent titles always gets the same title.
 */
export function makeTitle(
  context: PlayContext,
  deezerId: number,
  startedAt: number,
  options: TitleOptions = {},
): string {
  const clock = formatClock(context.localHour);
  const pool = variants(context, options.mood);
  const recent = (options.recentTitles ?? []).slice(0, TUNING.titles.avoidRecent).map(bodyOf);
  const recentLeads = new Set(recent.map(lead));
  const recentEndings = new Set(recent.map(ending));
  const recentBodies = new Set(recent.map((body) => body.toLowerCase()));

  const start = hashString(`${deezerId}:${startedAt}`) % pool.length;
  let best = pool[start];
  let bestCost = Infinity;
  for (let offset = 0; offset < pool.length; offset++) {
    const body = pool[(start + offset) % pool.length];
    const cost =
      (recentBodies.has(body.toLowerCase()) ? 8 : 0) +
      (`${body}, ${clock}`.length > TUNING.titles.maxChars ? 4 : 0) +
      (recentLeads.has(lead(body)) ? 2 : 0) +
      (recentEndings.has(ending(body)) ? 1 : 0);
    if (cost < bestCost) {
      best = body;
      bestCost = cost;
    }
  }
  return `${sentence(best)}, ${clock}`;
}
