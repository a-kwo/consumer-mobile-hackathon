import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Haptic feedback for Score's controls.
 *
 *   haptics.tap()      a light touch: icon buttons, pills, rows
 *   haptics.press()    a firmer thud: the primary start and stop control
 *   haptics.select()   a tick: chips, segmented options, a new cue landing
 *   haptics.success()  / warning() / error()   outcome notifications
 *
 * Every call is fire-and-forget and never throws: haptics are missing on the
 * web, in Low Power Mode and on some cloud devices, and that must not break a
 * press handler. The kit's buttons already call these; screens only need them
 * for gestures the kit does not own.
 *
 * Android uses the system haptic constants (no VIBRATE permission involved),
 * as the expo-haptics documentation recommends over the Vibrator-backed
 * impact styles.
 */

export type HapticKind = 'tap' | 'press' | 'select' | 'success' | 'warning' | 'error';

function run(effect: () => Promise<void>): void {
  if (Platform.OS === 'web') return;
  try {
    effect().catch(() => {});
  } catch {
    // Haptics are best effort.
  }
}

function android(type: Haptics.AndroidHaptics): Promise<void> {
  return Haptics.performAndroidHapticsAsync(type);
}

const isAndroid = Platform.OS === 'android';

export const haptics: Record<HapticKind, () => void> = {
  tap() {
    run(() =>
      isAndroid
        ? android(Haptics.AndroidHaptics.Virtual_Key)
        : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    );
  },
  press() {
    run(() =>
      isAndroid
        ? android(Haptics.AndroidHaptics.Long_Press)
        : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    );
  },
  select() {
    run(() => (isAndroid ? android(Haptics.AndroidHaptics.Clock_Tick) : Haptics.selectionAsync()));
  },
  success() {
    run(() =>
      isAndroid
        ? android(Haptics.AndroidHaptics.Confirm)
        : Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    );
  },
  warning() {
    run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
  },
  error() {
    run(() =>
      isAndroid
        ? android(Haptics.AndroidHaptics.Reject)
        : Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
    );
  },
};
