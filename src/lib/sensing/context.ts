/**
 * Small pieces of a `PlayContext`: the device clock as an hour, and what a
 * place of a given kind is called when it has no name. Pure.
 */
import type { Setting } from '../../../convex/lib/validators';

/** What a place without a name is called, by its kind. `any` has none. */
const SETTING_PLACE: Record<Setting, string | null> = {
  any: null,
  city: 'the city',
  nature: 'the park',
  indoors: 'home',
  transit: 'the train',
  gym: 'the gym',
};

/** The phrase for a setting, e.g. "the park"; null for `any`. */
export function placeForSetting(setting: Setting): string | null {
  return SETTING_PLACE[setting];
}

/** The device clock as a float hour, 0 to 24, to two decimals. */
export function localHourOf(date: Date): number {
  const hour = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
  return Math.round(hour * 100) / 100;
}
