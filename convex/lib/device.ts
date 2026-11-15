/**
 * Device ids. There are no accounts: the deviceId a phone generates is its only
 * credential, so it is never published (the feed shows profile ids instead) and
 * clients may not use the ids reserved for seeded friends.
 */
import { TUNING } from '../tuning';

/** True for a deviceId a client may read or write with. */
export function isClientDeviceId(deviceId: string): boolean {
  return (
    deviceId.length > 0 &&
    deviceId.length <= TUNING.maxDeviceIdChars &&
    !deviceId.startsWith(TUNING.feed.seedDevicePrefix)
  );
}

/** Throws for a deviceId a client may not use. For functions that must return a value. */
export function requireClientDeviceId(deviceId: string): void {
  if (!isClientDeviceId(deviceId)) throw new Error('invalid deviceId');
}
