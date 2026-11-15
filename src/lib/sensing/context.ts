/**
 * Turns simulator values or live readings into the `PlayContext` that is sent
 * with a pick and stored with a play. Pure.
 */
import type { Occasion, PlayContext, Setting } from '../../../convex/lib/validators';
import type { LiveReadings, SimValues } from '../score/types';
import type { Coordinates } from './geo';

/** What a set location adds to a context. */
export type ContextPlace = Coordinates & { placeName: string | null; temperatureC: number | null };

/** What a simulated play calls its place. `any` has no place. */
const SETTING_PLACE: Record<Setting, string | null> = {
  any: null,
  city: 'the city',
  nature: 'the park',
  indoors: 'home',
  transit: 'the train',
  gym: 'the gym',
};

/** The place phrase for a simulator setting, e.g. "the park"; null for `any`. */
export function placeForSetting(setting: Setting): string | null {
  return SETTING_PLACE[setting];
}

/** The device clock as a float hour, 0 to 24, to two decimals. */
export function localHourOf(date: Date): number {
  const hour = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
  return Math.round(hour * 100) / 100;
}

/**
 * `sim` holds the values in effect. With `place` (the location set in manual
 * mode) the context carries its coordinates and its name instead of the
 * setting's stock phrase, and the temperature when the weather is the place's.
 */
export function simulatedContext(
  sim: SimValues,
  occasion: Occasion | null = null,
  place: ContextPlace | null = null,
): PlayContext {
  const context: PlayContext = {
    cadenceSpm: sim.cadenceSpm,
    weather: sim.weather,
    localHour: sim.localHour,
    setting: sim.setting,
    simulated: true,
  };
  const placeName = place ? place.placeName : placeForSetting(sim.setting);
  if (placeName) context.placeName = placeName;
  if (place) {
    context.lat = place.lat;
    context.lon = place.lon;
    if (place.temperatureC !== null) context.temperatureC = place.temperatureC;
  }
  if (occasion) context.occasion = occasion;
  return context;
}

/** `setting` is that of the known place the phone is in, or `any`. */
export function liveContext(
  live: LiveReadings,
  coordinates: Coordinates | null,
  setting: Setting = 'any',
  occasion: Occasion | null = null,
): PlayContext {
  const context: PlayContext = {
    cadenceSpm: live.cadenceSpm,
    weather: live.weather,
    localHour: live.localHour,
    setting,
    simulated: false,
  };
  if (occasion) context.occasion = occasion;
  if (live.speedMps !== null) context.speedMps = live.speedMps;
  if (live.temperatureC !== null) context.temperatureC = live.temperatureC;
  if (live.placeName !== null) context.placeName = live.placeName;
  if (coordinates) {
    context.lat = coordinates.lat;
    context.lon = coordinates.lon;
  }
  return context;
}
