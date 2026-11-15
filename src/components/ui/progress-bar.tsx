import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { colors, motion, tones, type Tone } from '@/theme';

export type ProgressBarProps = {
  /** Progress from 0 to 1. Values outside the range are clamped. */
  value: number;
  /** Fill colour. `neutral` is off-white. @default 'neutral' */
  tone?: Tone;
  /** Track thickness in points. @default 3 */
  height?: number;
  /**
   * Milliseconds the fill takes to glide to a new value. Match it to how often
   * you update `value` (audio status ticks are usually 250 to 500 ms apart) so
   * the bar moves continuously. Use 0 while the user is scrubbing. @default 300
   */
  transitionMs?: number;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * A thin progress line: where the cue is in its 30 seconds.
 *
 *   <ProgressBar value={positionMs / durationMs} />
 */
export function ProgressBar({
  value,
  tone = 'neutral',
  height = 3,
  transitionMs = 300,
  accessibilityLabel = 'Progress',
  style,
}: ProgressBarProps) {
  const clamped = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      accessible
      style={[styles.track, { height, borderRadius: height / 2 }, style]}>
      <Animated.View
        style={[
          styles.fill,
          {
            width: `${clamped * 100}%`,
            borderRadius: height / 2,
            backgroundColor: tones[tone].solid,
            transitionProperty: 'width',
            transitionDuration: transitionMs,
            transitionTimingFunction: motion.easing.linear,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    alignSelf: 'stretch',
    overflow: 'hidden',
    backgroundColor: colors.hairlineStrong,
  },
  fill: {
    height: '100%',
  },
});
