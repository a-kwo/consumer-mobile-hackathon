import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, space, type Tone } from '@/theme';

import { AppText } from './app-text';

export type LiveBadgeProps = {
  /** Shown as written, in sentence case: "Live sensors", "Set by hand". @default 'Live' */
  label?: string;
  /** `danger` and `success` colour the dot. Every other tone is ink. @default 'accent' */
  tone?: Tone;
  /** A solid ink dot when true, a muted one when nothing is running. @default true */
  active?: boolean;
  /** @deprecated Ignored. The status is never outlined. */
  outlined?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * A status in words with a small dot: where the context is coming from.
 * It sits beside the wordmark at the top of Now. It does not pulse, and it is
 * not a pill.
 *
 *   <LiveBadge label="Live sensors" />
 *   <LiveBadge label="Paused" active={false} />
 */
export function LiveBadge({
  label = 'Live',
  tone = 'accent',
  active = true,
  style,
}: LiveBadgeProps) {
  let dot: string = active ? colors.ink : colors.inkFaint;
  if (tone === 'danger') dot = colors.danger;
  if (tone === 'success') dot = colors.success;

  return (
    <View style={[styles.wrap, style]}>
      <View accessibilityLabel={label} accessibilityRole="text" accessible style={styles.badge}>
        <View style={[styles.dot, { backgroundColor: dot }]} />
        <AppText numberOfLines={1} variant="meta">
          {label}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Hugs its content in a column and centres on the cross axis of a row.
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm - 2,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
