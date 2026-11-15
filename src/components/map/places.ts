import { useQuery } from 'convex/react';

import type { FeedItem } from '@/components/ost/queries';

import { api } from '../../../convex/_generated/api';
import { isCoordinate } from './globe-math';

/** Where a person is: a point and the words for it ("Lisbon"). */
export type Place = { lat: number; lon: number; label: string };

/**
 * Where a friend is, or null when the feed does not say (they hide their
 * places, or none of their plays has coordinates).
 */
export function placeOf(item: FeedItem): Place | null {
  const location = item.location;
  if (!location || !isCoordinate(location.lat, location.lon)) return null;
  return { lat: location.lat, lon: location.lon, label: location.label };
}

/**
 * Your own position for the "you" marker: where your newest play with
 * coordinates was. Null while loading and when it is not known.
 */
export function useMyPlace(deviceId: string | null): Place | null {
  const mine = useQuery(api.feed.me, deviceId ? { deviceId } : 'skip');
  return mine && isCoordinate(mine.lat, mine.lon) ? mine : null;
}
