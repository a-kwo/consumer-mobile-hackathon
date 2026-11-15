import { useQuery } from 'convex/react';

import type { FeedItem } from '@/components/ost/queries';
import type { OstEntry } from '@/lib/score';

import { api } from '../../../convex/_generated/api';
import { isCoordinate } from './projection';

/** Where a person is: a point and the words for it ("Lisbon"). */
export type Place = { lat: number; lon: number; label: string };

/** One track of a day that knows where it played. `index` is its place in the tracklist, from 0. */
export type Stop = { index: number; lat: number; lon: number; entry: OstEntry };

/**
 * Where a friend is, or null when the feed does not say (they hide their
 * places, or none of their plays has coordinates).
 */
export function placeOf(item: FeedItem): Place | null {
  const location = item.location;
  if (!location || !isCoordinate(location.lat, location.lon)) return null;
  return { lat: location.lat, lon: location.lon, label: location.label };
}

/** The tracks of a friend's day that carry coordinates, in play order. */
export function stopsOf(item: FeedItem): Stop[] {
  return item.entries.flatMap((entry, index) =>
    isCoordinate(entry.lat, entry.lon)
      ? [{ index, lat: entry.lat as number, lon: entry.lon as number, entry }]
      : []
  );
}

/**
 * The centre of a day for a still map: the friend's place, or failing that the
 * middle of the stops. Null when the day has no coordinates at all.
 */
export function centreOf(item: FeedItem, stops: readonly Stop[]): Place | null {
  const place = placeOf(item);
  if (place) return place;
  if (stops.length === 0) return null;
  return {
    lat: stops.reduce((sum, stop) => sum + stop.lat, 0) / stops.length,
    lon: stops.reduce((sum, stop) => sum + stop.lon, 0) / stops.length,
    label: '',
  };
}

/**
 * Your own position for the "you" marker: where your newest play with
 * coordinates was. Null while loading and when it is not known.
 */
export function useMyPlace(deviceId: string | null): Place | null {
  const mine = useQuery(api.feed.me, deviceId ? { deviceId } : 'skip');
  return mine && isCoordinate(mine.lat, mine.lon) ? mine : null;
}
