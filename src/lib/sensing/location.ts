/**
 * Where the user is, by name: the `location` the screens show in every mode.
 *
 * A location comes from the device (one position, looked up by name through
 * the backend) or from a place the user chose in a search. The last chosen one
 * is kept in AsyncStorage so a demo survives a reload; device positions are
 * never stored.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { type PlaceResult, type Setting, SETTINGS } from '../../../convex/lib/validators';
import { CONFIG } from '../score/config';

export type { PlaceResult };

export type ScoreLocation = {
  /** For display: "5th Avenue, New York". */
  label: string;
  street: string | null;
  area: string | null;
  city: string | null;
  /** Inferred from the kind of place; `any` when it says nothing. */
  setting: Setting;
  lat: number;
  lon: number;
  /** `device`: found by the phone or browser. `chosen`: picked from a search. */
  source: 'device' | 'chosen';
};

export type LocationStatus = 'idle' | 'locating' | 'denied' | 'unavailable' | 'error';

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

/**
 * A location from anything shaped like a place result, or null when it is not
 * usable (no label, no coordinates). Unknown settings become `any`.
 */
export function toLocation(place: unknown, source: ScoreLocation['source']): ScoreLocation | null {
  if (!place || typeof place !== 'object') return null;
  const raw = place as Record<string, unknown>;
  const label = text(raw.label);
  const { lat, lon } = raw;
  if (!label || typeof lat !== 'number' || typeof lon !== 'number') return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const setting = SETTINGS.includes(raw.setting as Setting) ? (raw.setting as Setting) : 'any';
  return {
    label,
    street: text(raw.street),
    area: text(raw.area),
    city: text(raw.city),
    setting,
    lat,
    lon,
    source,
  };
}

/**
 * The short name sent with picks and stored with plays: the street, else the
 * area, else the city. Never the full label, which reads badly in a title.
 */
export function placeNameOf(location: ScoreLocation): string | null {
  return location.street ?? location.area ?? location.city;
}

/** The chosen location saved on this device, or null. Never rejects. */
export async function loadChosenLocation(): Promise<ScoreLocation | null> {
  try {
    const stored = await AsyncStorage.getItem(CONFIG.sensing.chosenLocationStorageKey);
    return stored ? toLocation(JSON.parse(stored), 'chosen') : null;
  } catch {
    return null;
  }
}

/** Saves the chosen location, or forgets it when given null. Never rejects. */
export async function storeChosenLocation(location: ScoreLocation | null): Promise<void> {
  try {
    const key = CONFIG.sensing.chosenLocationStorageKey;
    if (location) await AsyncStorage.setItem(key, JSON.stringify(location));
    else await AsyncStorage.removeItem(key);
  } catch {
    // Kept in memory for this launch.
  }
}
