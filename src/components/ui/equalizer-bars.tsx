import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { css, useReducedMotion } from 'react-native-reanimated';

import { colors, textColors, type TextTone } from '@/theme';

export type EqualizerBarsProps = {
  /** Animate the bars. When false they rest as a low, still line. */
  playing: boolean;
  /** Height of the tallest bar, in points. The width follows. @default 16 */
  size?: number;
  /** Number of bars, 3 to 5. @default 4 */
  bars?: 3 | 4 | 5;
  /**
   * Colour of the bars while playing: pass the song's album ink. Wins over
   * `tone`. Defaults to ink.
   */
  tint?: string;
  /** A colour role, when there is no album ink. @default 'primary' */
  tone?: TextTone;
  /** Announced by screen readers. Defaults to "Playing" or "Paused". */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

/** Each bar gets its own shape and period so the group never moves in step. */
const SHAPES = [
  [0.35, 1, 0.55, 0.8],
  [0.75, 0.3, 1, 0.5],
  [0.5, 0.85, 0.3, 1],
  [0.95, 0.45, 0.7, 0.28],
  [0.4, 0.7, 1, 0.55],
] as const;
const PERIODS = [920, 1180, 760, 1340, 1020] as const;
/** Heights shown instead of the animation when Reduce Motion is on. */
const FROZEN = [0.5, 0.9, 0.65, 1, 0.45] as const;
const RESTING = 0.2;

const keyframes = SHAPES.map(([a, b, c, d]) =>
  css.keyframes({
    '0%': { transform: [{ scaleY: a }] },
    '25%': { transform: [{ scaleY: b }] },
    '50%': { transform: [{ scaleY: c }] },
    '75%': { transform: [{ scaleY: d }] },
    '100%': { transform: [{ scaleY: a }] },
  })
);

/**
 * A small sign that audio is playing: thin bars that move while `playing`
 * and settle to a flat line when not. For the active row of a tracklist and
 * the replay bar.
 *
 *   <EqualizerBars playing={isPlaying} tint={albumInk} />
 */
export function EqualizerBars({
  playing,
  size = 16,
  bars = 4,
  tint,
  tone = 'primary',
  accessibilityLabel,
  style,
}: EqualizerBarsProps) {
  const reduceMotion = useReducedMotion();
  const barWidth = Math.max(2, Math.round(size / 6));
  const gap = Math.max(1.5, barWidth * 0.75);
  const color = playing ? (tint ?? textColors[tone]) : colors.inkFaint;

  return (
    <View
      accessibilityLabel={accessibilityLabel ?? (playing ? 'Playing' : 'Paused')}
      accessibilityRole="image"
      accessible
      style={[styles.row, { height: size, gap }, style]}>
      {Array.from({ length: bars }, (_, index) => {
        const still = playing ? FROZEN[index] : RESTING;
        return (
          <Animated.View
            key={index}
            style={[
              {
                width: barWidth,
                height: size,
                borderRadius: barWidth / 2,
                backgroundColor: color,
                transformOrigin: 'bottom',
                transform: [{ scaleY: still }],
              },
              playing && !reduceMotion
                ? {
                    animationName: keyframes[index],
                    animationDuration: PERIODS[index],
                    animationIterationCount: 'infinite',
                    animationTimingFunction: 'ease-in-out',
                  }
                : null,
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
});
