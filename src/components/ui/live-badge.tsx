import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { css, useReducedMotion } from 'react-native-reanimated';

import { colors, layout, radius, space, tones, type Tone } from '@/theme';

import { AppText } from './app-text';

export type LiveBadgeProps = {
  /** Shown in upper case. @default 'Live' */
  label?: string;
  /**
   * `accent` (amber) for live sensing, `calm` (blue) for simulated values,
   * `neutral` for idle. @default 'accent'
   */
  tone?: Tone;
  /** Pulse the dot. Turn off when nothing is running. @default true */
  active?: boolean;
  /** Draw the capsule outline. Off gives a bare dot and label, like a film credit. @default true */
  outlined?: boolean;
  style?: StyleProp<ViewStyle>;
};

const halo = css.keyframes({
  '0%': { transform: [{ scale: 1 }], opacity: 0.55 },
  '70%': { transform: [{ scale: 2.8 }], opacity: 0 },
  '100%': { transform: [{ scale: 2.8 }], opacity: 0 },
});

/**
 * The tally light: a pulsing dot and a short status word.
 *
 *   <LiveBadge />                                  LIVE, amber, pulsing
 *   <LiveBadge label="Simulated" tone="calm" />
 *   <LiveBadge label="Paused" tone="neutral" active={false} />
 */
export function LiveBadge({
  label = 'Live',
  tone = 'accent',
  active = true,
  outlined = true,
  style,
}: LiveBadgeProps) {
  const reduceMotion = useReducedMotion();
  const palette = tones[tone];
  const dotColor = tone === 'neutral' ? colors.textTertiary : palette.solid;
  const pulsing = active && !reduceMotion;

  return (
    <View style={[styles.wrap, style]}>
      <View
        accessibilityLabel={label}
        accessibilityRole="text"
        accessible
        style={[
          styles.badge,
          outlined
            ? [styles.outlined, { backgroundColor: palette.bg, borderColor: palette.border }]
            : null,
        ]}>
        <View style={styles.dotBox}>
          <Animated.View
            style={[
              styles.dot,
              styles.halo,
              { backgroundColor: dotColor },
              pulsing
                ? {
                    animationName: halo,
                    animationDuration: 1800,
                    animationIterationCount: 'infinite',
                    animationTimingFunction: 'ease-out',
                  }
                : styles.hidden,
            ]}
          />
          <View style={[styles.dot, { backgroundColor: dotColor, opacity: active ? 1 : 0.6 }]} />
        </View>
        <AppText
          numberOfLines={1}
          style={{ color: tone === 'neutral' ? colors.textSecondary : palette.fg }}
          variant="overline">
          {label}
        </AppText>
      </View>
    </View>
  );
}

const DOT = 6;

const styles = StyleSheet.create({
  // Hugs its content in a column and centres on the cross axis of a row.
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  outlined: {
    height: 26,
    paddingLeft: space.sm + 2,
    paddingRight: space.md,
    borderRadius: radius.pill,
    borderWidth: layout.hairline,
  },
  dotBox: {
    width: DOT,
    height: DOT,
  },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
  },
  halo: {
    position: 'absolute',
  },
  hidden: {
    opacity: 0,
  },
});
