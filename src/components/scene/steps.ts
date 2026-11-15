/**
 * Wording for the Scene screen's findings: the short label each step keeps
 * once it has resolved, and the live reading shown after the scene is set.
 */
import type { SensingApi, SetupStep } from '@/lib/score';
import {
  describeOccasion,
  describePace,
  describeTime,
  describeWeather,
} from '@/lib/sensing/wording';

export type StepId = SetupStep['id'];

export const STEP_LABEL: Record<StepId, string> = {
  place: 'Place',
  weather: 'Weather',
  time: 'Time',
  calendar: 'Calendar',
  pace: 'Pace',
  music: 'First song',
};

export type Finding = { id: StepId; text: string };

/**
 * The reading of the moment as it is right now, from the live context: what
 * the Scene screen lists once the scene is set. It is worded by the same
 * functions the setup steps use, so the list reads the same as the reading
 * that produced it, and it follows the context: it changes as the user moves,
 * the hour turns or the weather does.
 */
export function liveFindings(sensing: SensingApi): Finding[] {
  const { context, location, occasion } = sensing;
  const place = location?.label ?? context.placeName ?? null;
  return [
    { id: 'place', text: place ?? 'Somewhere without a name' },
    { id: 'weather', text: describeWeather(context.weather, context.temperatureC ?? null) },
    { id: 'time', text: describeTime(new Date().getDay(), context.localHour) },
    { id: 'calendar', text: describeOccasion(occasion) },
    { id: 'pace', text: describePace(context.cadenceSpm) },
  ];
}
