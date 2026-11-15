/**
 * Demo scenarios: coherent stand-ins for the signals a device cannot provide.
 *
 * Every signal the app senses (place, weather, time, calendar, pace) comes from
 * the device when it can. On the web build and on simulators some cannot, and
 * a scenario fills exactly those gaps, so the app is always usable. A presenter
 * can also choose a scenario outright, and then it overrides the device.
 *
 * The places are real (real coordinates), so the weather for them is real too
 * unless the scenario pins one.
 */
import type { Occasion, Setting, Weather } from '../../../convex/lib/validators';

export type ScenarioPlace = {
  label: string;
  street: string | null;
  area: string | null;
  city: string | null;
  lat: number;
  lon: number;
};

export type Scenario = {
  id: string;
  /** For the presenter's picker. */
  label: string;
  /** Null for "at home": no address, no coordinates. */
  place: ScenarioPlace | null;
  setting: Setting;
  /** Steps per minute, and how far it drifts either side. */
  pace: { base: number; drift: number };
  /** An event coming up when the scenario begins, or none. */
  event: { occasion: Occasion; minutesUntil: number } | null;
  /** Used when the real weather at the place cannot be fetched. */
  fallbackWeather: Weather;
  /** Only when the scenario is chosen outright: the weather and hour to show regardless of reality. */
  pin?: { weather?: Weather; hour?: number };
};

/** In rotation order. */
export const SCENARIOS: readonly Scenario[] = [
  {
    id: 'fifth-avenue',
    label: 'Walking up 5th Avenue',
    place: {
      label: '5th Avenue, New York',
      street: '5th Avenue',
      area: 'Midtown',
      city: 'New York',
      lat: 40.7536,
      lon: -73.9812,
    },
    setting: 'city',
    pace: { base: 104, drift: 4 },
    event: { occasion: 'date', minutesUntil: 40 },
    fallbackWeather: 'cloudy',
  },
  {
    id: 'golden-gate-park',
    label: 'A run in Golden Gate Park',
    place: {
      label: 'Golden Gate Park, San Francisco',
      street: null,
      area: 'Golden Gate Park',
      city: 'San Francisco',
      lat: 37.7694,
      lon: -122.4862,
    },
    setting: 'nature',
    pace: { base: 165, drift: 5 },
    event: null,
    fallbackWeather: 'fog',
  },
  {
    id: 'shibuya',
    label: 'Shibuya at night, in the rain',
    place: {
      label: 'Shibuya, Tokyo',
      street: null,
      area: 'Shibuya',
      city: 'Tokyo',
      lat: 35.6595,
      lon: 139.7005,
    },
    setting: 'city',
    pace: { base: 118, drift: 4 },
    event: { occasion: 'party', minutesUntil: 25 },
    fallbackWeather: 'rain',
    pin: { weather: 'rain', hour: 21.5 },
  },
  {
    id: 'gym',
    label: 'On the treadmill at the gym',
    place: {
      label: 'Chelsea Piers, New York',
      street: null,
      area: 'Chelsea Piers',
      city: 'New York',
      lat: 40.7465,
      lon: -74.0083,
    },
    setting: 'gym',
    pace: { base: 152, drift: 5 },
    event: { occasion: 'workout', minutesUntil: 0 },
    fallbackWeather: 'clear',
  },
  {
    id: 'home',
    label: 'A quiet evening at home',
    place: null,
    setting: 'indoors',
    pace: { base: 0, drift: 0 },
    event: { occasion: 'wind_down', minutesUntil: 30 },
    fallbackWeather: 'cloudy',
  },
];

export function scenarioById(id: string | null | undefined): Scenario | null {
  return SCENARIOS.find((scenario) => scenario.id === id) ?? null;
}

/**
 * The scenario's cadence at `nowMs`: the base with a slow, slight wander, the
 * way a real walk never holds one number. Deterministic, whole steps.
 */
export function demoCadence(pace: Scenario['pace'], nowMs: number): number {
  if (pace.base <= 0) return 0;
  const seconds = nowMs / 1000;
  const wander = 0.7 * Math.sin(seconds / 11) + 0.3 * Math.sin(seconds / 3.7);
  return Math.max(0, Math.round(pace.base + pace.drift * wander));
}
