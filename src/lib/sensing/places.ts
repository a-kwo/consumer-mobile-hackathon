/**
 * Known places: spots the user has tagged with one of the scene settings, so
 * live sensing can say "at the gym" without being told each time. They live on
 * the phone only, with rounded coordinates, and are never sent to the backend.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Setting } from '../../../convex/lib/validators';
import { TUNING } from '../../../convex/tuning';
import { CONFIG } from '../score/config';
import { type Coordinates, distanceMeters } from './geo';

export const PLACE_KINDS = ['home', 'gym', 'park', 'commute', 'city'] as const;
export type PlaceKind = (typeof PLACE_KINDS)[number];

/** The scene setting each kind of place stands for. */
export const PLACE_SETTING: Record<PlaceKind, Setting> = {
  home: 'indoors',
  gym: 'gym',
  park: 'nature',
  commute: 'transit',
  city: 'city',
};

export type SavedPlace = {
  id: string;
  kind: PlaceKind;
  /** Rounded to `TUNING.places.coordinateDecimals`. */
  lat: number;
  lon: number;
  savedAt: number;
};

function roundCoordinate(value: number): number {
  const factor = 10 ** TUNING.places.coordinateDecimals;
  return Math.round(value * factor) / factor;
}

/** The saved place the coordinates fall inside, nearest first; null when there is none. Pure. */
export function placeAt(places: readonly SavedPlace[], at: Coordinates | null): SavedPlace | null {
  if (!at) return null;
  let nearest: SavedPlace | null = null;
  let nearestM: number = TUNING.places.radiusM;
  for (const place of places) {
    const metres = distanceMeters(place, at);
    if (metres <= nearestM) {
      nearest = place;
      nearestM = metres;
    }
  }
  return nearest;
}

/**
 * The list with this spot tagged as `kind`. A place already saved here is
 * replaced, and the oldest places make room when the list is full. Pure.
 */
export function withPlace(
  places: readonly SavedPlace[],
  kind: PlaceKind,
  at: Coordinates,
  now: number,
): SavedPlace[] {
  const place: SavedPlace = {
    id: `${now.toString(36)}-${kind}`,
    kind,
    lat: roundCoordinate(at.lat),
    lon: roundCoordinate(at.lon),
    savedAt: now,
  };
  const elsewhere = places.filter((saved) => distanceMeters(saved, place) > TUNING.places.radiusM);
  return [...elsewhere, place].slice(-TUNING.places.max);
}

function isSavedPlace(value: unknown): value is SavedPlace {
  if (typeof value !== 'object' || value === null) return false;
  const place = value as Record<string, unknown>;
  return (
    typeof place.id === 'string' &&
    (PLACE_KINDS as readonly unknown[]).includes(place.kind) &&
    typeof place.lat === 'number' &&
    Number.isFinite(place.lat) &&
    typeof place.lon === 'number' &&
    Number.isFinite(place.lon) &&
    typeof place.savedAt === 'number'
  );
}

/** Reads the saved places. Never rejects: unreadable storage is an empty list. */
export async function loadPlaces(): Promise<SavedPlace[]> {
  try {
    const stored = await AsyncStorage.getItem(CONFIG.sensing.placesStorageKey);
    const parsed: unknown = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? parsed.filter(isSavedPlace).slice(-TUNING.places.max) : [];
  } catch {
    return [];
  }
}

/** Writes the saved places. Never rejects: on failure they last for this launch only. */
export async function storePlaces(places: readonly SavedPlace[]): Promise<void> {
  try {
    await AsyncStorage.setItem(CONFIG.sensing.placesStorageKey, JSON.stringify(places));
  } catch {
    // Kept in memory for this launch.
  }
}
