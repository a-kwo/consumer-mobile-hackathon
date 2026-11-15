/**
 * Context to scene. Pure and deterministic: the Convex `next:pick` action and the
 * app (simulator preview, switch detection) both call this, so they always agree.
 */
import { TUNING } from '../tuning';
import type { Pace, Scene, Setting, TimeOfDay, Weather } from './validators';

export type SceneInput = {
  /** Steps per minute. */
  cadenceSpm: number;
  /** Local hour of day as a float, 0 to 24. */
  localHour: number;
  weather: Weather;
  setting: Setting;
  /** Carried nudge, clamped to plus or minus TUNING.maxEnergyBias. */
  energyBias?: number;
  temperatureC?: number | null;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function paceFor(cadenceSpm: number): Pace {
  const { paceMinSpm } = TUNING;
  if (!(cadenceSpm >= paceMinSpm.stroll)) return 'still';
  if (cadenceSpm < paceMinSpm.walk) return 'stroll';
  if (cadenceSpm < paceMinSpm.brisk) return 'walk';
  if (cadenceSpm < paceMinSpm.run) return 'brisk';
  return 'run';
}

/** Wraps any number into the 0 to 24 range. */
export function normalizeHour(localHour: number): number {
  if (!Number.isFinite(localHour)) return 12;
  return ((localHour % 24) + 24) % 24;
}

export function timeOfDayFor(localHour: number): TimeOfDay {
  const hour = normalizeHour(localHour);
  const start = TUNING.timeOfDayStartHour;
  if (hour >= start.night || hour < start.morning) return 'night';
  if (hour < start.afternoon) return 'morning';
  if (hour < start.evening) return 'afternoon';
  return 'evening';
}

export function sceneKey(pace: Pace, weather: Weather, timeOfDay: TimeOfDay, setting: Setting): string {
  return `${pace}|${weather}|${timeOfDay}|${setting}`;
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
  city: ' in the city',
  nature: ' in the park',
  indoors: ' at home',
  transit: ' on the train',
  gym: ' at the gym',
};

const TIME_LABEL: Record<TimeOfDay, string> = {
  morning: 'morning',
  afternoon: 'afternoon',
  evening: 'evening',
  night: 'late night',
};

/** Lower-case label such as "slow rainy walk in the city, late night". */
export function sceneLabel(pace: Pace, weather: Weather, timeOfDay: TimeOfDay, setting: Setting): string {
  const daylight = timeOfDay === 'morning' || timeOfDay === 'afternoon';
  const adjective = weather === 'clear' && daylight ? 'sunny' : WEATHER_ADJECTIVE[weather];
  const join = (...words: string[]) => words.filter(Boolean).join(' ');
  const paceWords: Record<Pace, string> = {
    still: join('quiet', adjective, 'moment'),
    stroll: join('slow', adjective, 'walk'),
    walk: join(adjective, 'walk'),
    brisk: join('brisk', adjective, 'walk'),
    run: join(adjective, 'run'),
  };
  return `${paceWords[pace]}${SETTING_PHRASE[setting]}, ${TIME_LABEL[timeOfDay]}`;
}

/** Linear interpolation along TUNING.energyCurve. */
export function energyForCadence(cadenceSpm: number): number {
  const curve = TUNING.energyCurve;
  const spm = Number.isFinite(cadenceSpm) ? Math.max(0, cadenceSpm) : 0;
  if (spm <= curve[0].spm) return curve[0].energy;
  for (let i = 1; i < curve.length; i++) {
    const low = curve[i - 1];
    const high = curve[i];
    if (spm <= high.spm) {
      const t = (spm - low.spm) / (high.spm - low.spm);
      return low.energy + t * (high.energy - low.energy);
    }
  }
  return curve[curve.length - 1].energy;
}

function isLateNight(localHour: number): boolean {
  const hour = normalizeHour(localHour);
  return hour >= TUNING.nightStartHour || hour < TUNING.nightEndHour;
}

export function buildScene(input: SceneInput): Scene {
  const pace = paceFor(input.cadenceSpm);
  const timeOfDay = timeOfDayFor(input.localHour);
  const { weather, setting } = input;
  const settingShift = TUNING.settingShift[setting];
  const bias = clamp(input.energyBias ?? 0, -TUNING.maxEnergyBias, TUNING.maxEnergyBias);

  const energy = clamp(
    energyForCadence(input.cadenceSpm) +
      (isLateNight(input.localHour) ? TUNING.nightEnergyShift : 0) +
      settingShift.energy +
      bias,
    0.05,
    1,
  );
  const valence = clamp(
    TUNING.valenceByWeather[weather] + TUNING.valenceShiftByTime[timeOfDay] + settingShift.valence,
    0.05,
    0.95,
  );

  return {
    key: sceneKey(pace, weather, timeOfDay, setting),
    label: sceneLabel(pace, weather, timeOfDay, setting),
    pace,
    weather,
    timeOfDay,
    setting,
    energy,
    valence,
    bpm: pace === 'still' ? null : Math.round(input.cadenceSpm),
    temperatureC: input.temperatureC ?? null,
  };
}
