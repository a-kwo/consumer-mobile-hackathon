/**
 * The only file that touches expo-audio. It creates the players the crossfader
 * drives and configures the audio session.
 *
 * Facts this relies on, from the SDK 58 docs and the installed package source:
 * - `createAudioPlayer(null, options)` returns a player that is not tied to a
 *   component; it lives until `release()` is called.
 * - `player.replace(url)` loads a new source; `player.isLoaded` turns true when
 *   it can play. `player.replace(null)` unloads on iOS and Android.
 * - `currentTime` and `duration` are in seconds; `volume` is 0 to 1.
 * - `player.currentStatus` returns the whole status in one native read (it is
 *   what `useAudioPlayerStatus` starts from).
 * - On iOS `playsInSilentMode` must be passed explicitly: the native default
 *   is false.
 * - A `playbackStatusUpdate` event carries `didJustFinish` when a song ends and
 *   `error` when loading or playback fails.
 */
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { Platform } from 'react-native';

import { CONFIG } from '../score/config';
import type { DeckPlayer } from './crossfader';

export function createDeckPlayer(): DeckPlayer {
  return createAudioPlayer(null, { updateInterval: CONFIG.audio.statusIntervalMs });
}

/** `replace(null)` unloads a native player; on web it would load a bogus URL. */
export function canUnloadPlayers(): boolean {
  return Platform.OS !== 'web';
}

/**
 * Sets the audio session so that sound plays with the iPhone silent switch on
 * and other apps' audio pauses while Score plays. Playback is foreground only:
 * the OS pauses the players when the app goes to the background and resumes
 * them when it returns.
 */
export async function configureAudioMode(): Promise<void> {
  await setAudioModeAsync({
    playsInSilentMode: true,
    interruptionMode: 'doNotMix',
    shouldPlayInBackground: false,
  });
}
