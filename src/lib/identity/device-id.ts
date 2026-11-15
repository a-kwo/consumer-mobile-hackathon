/**
 * The device id that stands in for an account. Generated once, then kept in
 * AsyncStorage for the life of the install.
 *
 * Ids made on simulators, emulators, cloud test devices and web carry the
 * `sim-` prefix so the backend can keep their plays out of the feed.
 * (`Device.isDevice` is false on simulators and emulators and always true on
 * web, which is why web is checked separately.)
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

import { CONFIG } from '../score/config';

/** True when this is not a real phone in someone's hand. */
export function isSimulatedDevice(): boolean {
  return Platform.OS === 'web' || !Device.isDevice;
}

function randomId(): string {
  try {
    return Crypto.randomUUID();
  } catch {
    // No secure random source: uniqueness is all this id needs.
    const part = () => Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
    return `${part()}-${part()}-${part()}-${part()}`;
  }
}

export function createDeviceId(): string {
  return `${isSimulatedDevice() ? CONFIG.identity.simulatedPrefix : ''}${randomId()}`;
}

/**
 * Returns the stored id, creating and storing one on first launch. Never
 * rejects: when storage is unavailable the id lasts for this launch only.
 */
export async function loadOrCreateDeviceId(): Promise<string> {
  try {
    const stored = await AsyncStorage.getItem(CONFIG.identity.storageKey);
    if (stored) return stored;
  } catch {
    // Fall through and create one.
  }
  const id = createDeviceId();
  try {
    await AsyncStorage.setItem(CONFIG.identity.storageKey, id);
  } catch {
    // Kept in memory for this launch.
  }
  return id;
}
