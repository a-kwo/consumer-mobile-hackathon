/**
 * Wording and formatting shared by the Now and Simulator screens: clock times,
 * weather and setting names with their icons, and the small phrases built from
 * the engine's values.
 */
import type { IconName } from '@/components/ui';
import type { Occasion, PlaceKind, Setting, Weather } from '@/lib/score';

import { occasionLabel } from '../../../convex/lib/occasion';
import { normalizeHour, paceFor, timeOfDayFor } from '../../../convex/lib/scene';

export const WEATHER_META: Record<Weather, { label: string; icon: IconName }> = {
  any: { label: 'Any', icon: 'ellipse-outline' },
  clear: { label: 'Clear', icon: 'sunny-outline' },
  cloudy: { label: 'Cloudy', icon: 'cloud-outline' },
  fog: { label: 'Fog', icon: 'reorder-three-outline' },
  rain: { label: 'Rain', icon: 'rainy-outline' },
  snow: { label: 'Snow', icon: 'snow-outline' },
  storm: { label: 'Storm', icon: 'thunderstorm-outline' },
};

export const SETTING_META: Record<Setting, { label: string; icon: IconName }> = {
  any: { label: 'Any', icon: 'ellipse-outline' },
  city: { label: 'City', icon: 'business-outline' },
  nature: { label: 'Nature', icon: 'leaf-outline' },
  indoors: { label: 'Indoors', icon: 'home-outline' },
  transit: { label: 'Transit', icon: 'train-outline' },
  gym: { label: 'Gym', icon: 'barbell-outline' },
};

export const OCCASION_META: Record<Occasion, { label: string; icon: IconName }> = {
  game: { label: occasionLabel('game'), icon: 'trophy-outline' },
  workout: { label: occasionLabel('workout'), icon: 'barbell-outline' },
  focus: { label: occasionLabel('focus'), icon: 'glasses-outline' },
  party: { label: occasionLabel('party'), icon: 'sparkles-outline' },
  travel: { label: occasionLabel('travel'), icon: 'airplane-outline' },
  wind_down: { label: occasionLabel('wind_down'), icon: 'bed-outline' },
  date: { label: occasionLabel('date'), icon: 'heart-outline' },
};

export const PLACE_META: Record<PlaceKind, { label: string; icon: IconName }> = {
  home: { label: 'Home', icon: 'home-outline' },
  gym: { label: 'Gym', icon: 'barbell-outline' },
  park: { label: 'Park', icon: 'leaf-outline' },
  commute: { label: 'Commute', icon: 'train-outline' },
  city: { label: 'City', icon: 'business-outline' },
};

const PACE_WORD = {
  still: 'still',
  stroll: 'stroll',
  walk: 'walk',
  brisk: 'brisk',
  run: 'run',
} as const;

const TIME_WORD = {
  morning: 'morning',
  afternoon: 'afternoon',
  evening: 'evening',
  night: 'night',
} as const;

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

/** "Rain · 9°", or just "Rain" when the temperature is unknown. */
export function formatWeather(weather: Weather, temperatureC?: number | null): string {
  const label = WEATHER_META[weather].label;
  return typeof temperatureC === 'number' ? `${label} · ${Math.round(temperatureC)}°` : label;
}

/** "112 spm", or "Still" below walking pace. */
export function formatCadence(cadenceSpm: number): string {
  return paceFor(cadenceSpm) === 'still' && cadenceSpm < 1 ? 'Still' : `${Math.round(cadenceSpm)} spm`;
}

/** The slider readout: "112 spm · brisk". */
export function formatCadenceWithPace(cadenceSpm: number): string {
  return `${Math.round(cadenceSpm)} spm · ${PACE_WORD[paceFor(cadenceSpm)]}`;
}

/** The slider readout: "11:30 PM · night". */
export function formatHourWithTimeOfDay(localHour: number): string {
  return `${formatClock(localHour)} · ${TIME_WORD[timeOfDayFor(localHour)]}`;
}

/** "Calmer for 2 more cues", or null when no nudge is being carried. */
export function nudgeLine(energyBias: number, nudgePicksLeft: number): string | null {
  if (nudgePicksLeft <= 0 || energyBias === 0) return null;
  const word = energyBias < 0 ? 'Calmer' : 'More energy';
  return `${word} for ${nudgePicksLeft} more ${nudgePicksLeft === 1 ? 'cue' : 'cues'}`;
}
