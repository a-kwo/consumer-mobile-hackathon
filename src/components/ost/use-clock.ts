import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

const MINUTE = 60_000;

function subscribe(listener: () => void): () => void {
  const timer = setInterval(listener, 15_000);
  const appState = AppState.addEventListener('change', listener);
  return () => {
    clearInterval(timer);
    appState.remove();
  };
}

const getSnapshot = () => Math.floor(Date.now() / MINUTE) * MINUTE;

/**
 * The current time, rounded down to the minute. It moves forward on its own
 * and when the app returns to the foreground, so "today" rolls over at
 * midnight without anything reading the clock during render.
 */
export function useMinuteClock(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
