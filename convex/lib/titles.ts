/**
 * Titles for soundtrack entries, in the spirit of "Rain on 4th Street, 6:12pm".
 * Pure and deterministic: fixed templates, chosen by a hash of the play, so a
 * mutation can generate them and the same play always gets the same title.
 *
 * Weather leads when there is weather worth mentioning, pace leads on a run,
 * and otherwise the time of day does.
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
  if (STREET.test(name) || /^\d/.test(name)) return { at: `on ${name}`, through: `down ${name}`, indoors };
  if (AT_NOUN.test(name)) return { at: `at ${name}`, through: `at ${name}`, indoors: true };
  return { at: `in ${name}`, through: `through ${name}`, indoors };
}

type BadWeather = 'rain' | 'snow' | 'fog' | 'storm';
const isBadWeather = (weather: Weather): weather is BadWeather =>
  weather === 'rain' || weather === 'snow' || weather === 'fog' || weather === 'storm';

const WEATHER_WORDS: Record<BadWeather, { noun: string; adjective: string; indoors: string; waiting: string }> = {
  rain: { noun: 'rain', adjective: 'rainy', indoors: 'rain on the window', waiting: 'waiting out the rain' },
  snow: { noun: 'snow', adjective: 'snowy', indoors: 'snow past the window', waiting: 'watching the snow fall' },
  fog: { noun: 'fog', adjective: 'foggy', indoors: 'fog at the window', waiting: 'watching the fog roll in' },
  storm: { noun: 'storm', adjective: 'stormy', indoors: 'thunder outside', waiting: 'waiting out the storm' },
};

const PACE_WORDS: Record<Exclude<Pace, 'still'>, { noun: string; moving: string; out: string }> = {
  stroll: { noun: 'stroll', moving: 'wandering', out: 'out for a wander' },
  walk: { noun: 'walk', moving: 'walking', out: 'out walking' },
  brisk: { noun: 'walk', moving: 'hurrying', out: 'on the move' },
  run: { noun: 'run', moving: 'running', out: 'out for a run' },
};

const join = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(' ');
const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Every phrasing that fits the context. The caller picks one by hash. */
function variants(context: PlayContext): string[] {
  const pace = paceFor(context.cadenceSpm);
  const day = dayWord(context.localHour);
  const place = placeFor(context);
  const moving = pace === 'still' ? null : PACE_WORDS[pace];

  // Moving indoors (a treadmill) is not a walk in the rain, whatever the sky is doing.
  if (isBadWeather(context.weather) && !(moving && place?.indoors)) {
    const weather = WEATHER_WORDS[context.weather];
    if (moving) {
      return [
        place ? join(weather.noun, place.at) : join(weather.adjective, day, moving.noun),
        join(weather.adjective, day, moving.noun, place?.at),
        join(moving.moving, 'through the', weather.noun),
      ];
    }
    return [
      place && !place.indoors ? join(weather.noun, place.at) : weather.indoors,
      join(weather.adjective, day, place?.at),
      weather.waiting,
    ];
  }

  if (pace === 'run') {
    return [
      join(day, 'run', place?.through),
      place ? join('running', place.through) : 'out for a run',
      join(day, 'miles', place?.at),
    ];
  }

  if (moving) {
    const sunny = context.weather === 'clear' && (day === 'morning' || day === 'midday' || day === 'afternoon');
    return [
      join(pace === 'brisk' ? 'brisk' : null, day, moving.noun, place?.at),
      place ? join(moving.moving, place.through) : moving.out,
      sunny ? join('sunny', moving.noun, place?.at) : join(pace === 'stroll' ? 'a slow' : 'a', moving.noun, place?.at),
    ];
  }

  const pause: Record<Setting, string> = {
    any: 'a quiet moment',
    city: 'a pause in the city',
    nature: 'a pause in the park',
    indoors: 'a quiet moment at home',
    transit: 'window seat',
    gym: 'between sets',
  };
  return [
    place ? join(day, place.at) : join('quiet', day),
    join('quiet', day, place?.at),
    context.placeName && place ? join('a pause', place.at) : pause[context.setting],
  ];
}

/**
 * The title of one soundtrack entry, e.g. "Evening walk on Valencia Street, 6:12pm".
 * `deezerId` and `startedAt` only choose between phrasings.
 */
export function makeTitle(context: PlayContext, deezerId: number, startedAt: number): string {
  const options = variants(context);
  const body = options[hashString(`${deezerId}:${startedAt}`) % options.length];
  return `${sentence(body)}, ${formatClock(context.localHour)}`;
}
