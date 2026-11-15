/**
 * Wording and formatting for the Now and Scene screens: the scene as a
 * sentence, the meta line, clock and playback times.
 */
import type { IconName } from '@/components/ui';
import type { PlayContext, Scene, Setting, Weather } from '@/lib/score';

import { normalizeHour } from '../../../convex/lib/scene';

const WEATHER_META: Record<Weather, { label: string; icon: IconName }> = {
  any: { label: 'Any', icon: 'ellipse-outline' },
  clear: { label: 'Clear', icon: 'sunny-outline' },
  cloudy: { label: 'Cloudy', icon: 'cloud-outline' },
  fog: { label: 'Fog', icon: 'reorder-three-outline' },
  rain: { label: 'Rain', icon: 'rainy-outline' },
  snow: { label: 'Snow', icon: 'snow-outline' },
  storm: { label: 'Storm', icon: 'thunderstorm-outline' },
};

/** "slow rainy walk" becomes "Slow rainy walk". */
export function capitalise(text: string): string {
  return text.length > 0 ? text[0].toUpperCase() + text.slice(1) : text;
}

/** A float hour (0 to 24) as a clock time: 23.5 becomes "11:30 PM". */
export function formatClock(localHour: number): string {
  const totalMinutes = Math.round(normalizeHour(localHour) * 60) % (24 * 60);
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
}

/** Milliseconds as "m:ss". */
export function formatMs(ms: number): string {
  const seconds = Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 1000)) : 0;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** "92 steps/min", or "Standing still" when there are no steps. */
export function formatCadence(cadenceSpm: number): string {
  return cadenceSpm < 1 ? 'Standing still' : `${Math.round(cadenceSpm)} steps/min`;
}

/** "Calmer for 2 more cues", or null when no nudge is being carried. */
export function nudgeLine(energyBias: number, nudgePicksLeft: number): string | null {
  if (nudgePicksLeft <= 0 || energyBias === 0) return null;
  const word = energyBias < 0 ? 'Calmer' : 'More energy';
  return `${word} for ${nudgePicksLeft} more ${nudgePicksLeft === 1 ? 'cue' : 'cues'}`;
}

const WEATHER_ADJECTIVE: Record<Weather, string> = {
  any: '',
  clear: 'clear',
  cloudy: 'cloudy',
  fog: 'foggy',
  rain: 'rainy',
  snow: 'snowy',
  storm: 'stormy',
};

const SETTING_PHRASE: Record<Setting, string> = {
  any: '',
  city: 'in the city',
  nature: 'in the park',
  indoors: 'at home',
  transit: 'on the train',
  gym: 'at the gym',
};

/**
 * The scene as a sentence for the italic scene line: "A slow rainy walk in the
 * city, late at night", "A sunny afternoon walk in the park". Built from the
 * scene's parts rather than its label, so it reads as prose.
 */
export function sceneSentence(scene: Pick<Scene, 'pace' | 'weather' | 'setting' | 'timeOfDay'>): string {
  const night = scene.timeOfDay === 'night';
  const daylight = scene.timeOfDay === 'morning' || scene.timeOfDay === 'afternoon';
  const adjective =
    scene.weather === 'clear' && daylight ? 'sunny' : WEATHER_ADJECTIVE[scene.weather];
  // By day the time is part of the phrase ("morning walk"); at night it trails the sentence.
  const time = night ? '' : scene.timeOfDay;
  const join = (...words: string[]) => words.filter(Boolean).join(' ');

  let what: string;
  if (scene.pace === 'still') {
    // Standing still at the gym is lifting, not resting.
    if (scene.setting === 'gym') what = join(time, 'workout');
    else what = time ? join('quiet', adjective, time) : join('quiet', adjective, 'moment');
  } else if (scene.pace === 'stroll') what = join('slow', adjective, time, 'walk');
  else if (scene.pace === 'walk') what = join(adjective, time, 'walk');
  else if (scene.pace === 'brisk') what = join('brisk', adjective, time, 'walk');
  else what = join(adjective, time, 'run');

  const article = /^[aeiou]/.test(what) ? 'An' : 'A';
  const sentence = join(article, what, SETTING_PHRASE[scene.setting]);
  return night ? `${sentence}, late at night` : sentence;
}
/**
 * The occasion in a few words for the meta line: "Game in 45 min" from the
 * scene's "Game in 45 min · building up". Null when the scene has none.
 */
export function occasionShort(scene: Scene | null | undefined): string | null {
  if (!scene?.occasion || !scene.occasionLine) return null;
  return scene.occasionLine.split(' · ')[0];
}

/**
 * The start of the meta line: "92 steps/min · Rain, 9°". The weather falls
 * back to the one the server resolved for the playing song when the context
 * has none. Pass `brief` to leave the weather out when the line has more to
 * carry (an occasion and a nudge).
 */
export function metaLine(context: PlayContext, scene?: Scene | null, brief = false): string {
  const weather = context.weather !== 'any' ? context.weather : (scene?.weather ?? 'any');
  const temperatureC = context.temperatureC ?? scene?.temperatureC ?? null;
  const parts = [formatCadence(context.cadenceSpm)];
  if (weather !== 'any' && !brief) {
    parts.push(
      typeof temperatureC === 'number'
        ? `${WEATHER_META[weather].label}, ${Math.round(temperatureC)}°`
        : WEATHER_META[weather].label
    );
  }
  return parts.join(' · ');
}
