import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { colors, motion, sizes, tones, type Tone } from '@/theme';

export type ProgressBarProps = {
  /** Progress from 0 to 1. Values outside the range are clamped. */
  value: number;
  /**
   * Fill colour: pass the song's album ink. Wins over `tone`. Defaults to ink.
   */
  tint?: string;
  /** A tone, when there is no album ink. Every tone but `danger` and `success` is ink. @default 'neutral' */
  tone?: Tone;
  /** Thickness in points. @default 2 */
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
 * The progress line: 2 points high, a hairline track, filled in album ink.
 *
 *   <ProgressBar value={positionMs / durationMs} tint={albumInk} />
 */
export function ProgressBar({
  value,
  tint,
  tone = 'neutral',
  height = sizes.progress,
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
            backgroundColor: tint ?? tones[tone].solid,
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
    backgroundColor: colors.hairline,
  },
  fill: {
    height: '100%',
  },
});
