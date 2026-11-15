import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

/**
 * How much of the bottom of the window the tab bar takes, measured rather
 * than assumed, so the replay bar always sits just above it.
 *
 * - iOS: the tab bar is drawn over the bottom of each screen, and
 *   `useScreenInsets()` inside a tab reports the bar plus the home indicator.
 *   The probe passes that on.
 * - Android and web: the tab bar is laid out below each screen, so the space
 *   is the height of the tabs container minus the height of a screen in it.
 *
 * Until a probe has reported, `useTabBarSpace()` returns null and the replay
 * bar falls back to the tab bar's token height plus the bottom safe area.
 */
let iosInset: number | null = null;
let containerHeight: number | null = null;
let screenHeight: number | null = null;
let current: number | null = null;

const listeners = new Set<() => void>();

function compute(): number | null {
  if (Platform.OS === 'ios') return iosInset;
  if (containerHeight !== null && screenHeight !== null) {
    const space = Math.round(containerHeight - screenHeight);
    // Anything outside this range is not a tab bar (a keyboard, a split window).
    return space >= 40 && space <= 200 ? space : null;
  }
  return null;
}

function publish(): void {
  const next = compute();
  if (next === current) return;
  current = next;
  listeners.forEach((listener) => listener());
}

/** iOS: the bottom safe-area inset seen from inside a tab. */
export function reportTabInset(inset: number): void {
  iosInset = inset;
  publish();
}

/** Height of the view that holds the whole tab navigator. */
export function reportTabsContainerHeight(height: number): void {
  containerHeight = height;
  publish();
}

/** Height of a screen laid out inside a tab. */
export function reportTabScreenHeight(height: number): void {
  screenHeight = height;
  publish();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => current;

/** Points the tab bar (and the home indicator or navigation bar) takes at the bottom, or null if unknown. */
export function useTabBarSpace(): number | null {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
