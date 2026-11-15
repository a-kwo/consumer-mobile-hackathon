import { useQuery } from 'convex/react';

import { api } from '../../../convex/_generated/api';
import type { FeedItem, Ost, OstPhoto } from '../../../convex/lib/validators';

/**
 * A device's soundtrack for one local day, live. `undefined` while loading,
 * including the first moments when the device id is not known yet.
 */
export function useOst(deviceId: string | null, dayStart: number, dayEnd: number): Ost | undefined {
  return useQuery(api.ost.get, deviceId ? { deviceId, dayStart, dayEnd } : 'skip');
}

/** Friends' recent soundtracks, newest first, live. `undefined` while loading. */
export function useFeed(deviceId: string | null): FeedItem[] | undefined {
  return useQuery(api.feed.list, deviceId ? { deviceId } : 'skip');
}

export type { FeedItem, Ost, OstPhoto };
