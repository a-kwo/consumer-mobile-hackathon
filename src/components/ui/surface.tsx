import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';

import { colors, layout, radius, space, type RadiusToken, type SpaceToken } from '@/theme';

export type SurfaceProps = Omit<ViewProps, 'style'> & {
  children?: ReactNode;
  /**
   * `default` is white at 6 %, `raised` at 10 % for a panel on top of another,
   * `accent` is tinted amber for the one panel that is live. @default 'default'
   */
  variant?: 'default' | 'raised' | 'accent';
  /** Inner padding, as a spacing token. @default 'lg' */
  padding?: SpaceToken;
  /** Corner radius, as a radius token. @default 'lg' */
  radius?: RadiusToken;
  style?: StyleProp<ViewStyle>;
};

/**
 * A translucent panel: white at low alpha with a hairline border, so the
 * ambient wash shows through. Score has no solid cards.
 *
 *   <Surface style={{ gap: space.md }}>…</Surface>
 *   <Surface padding="none" radius="md">  rows with their own padding  </Surface>
 */
export function Surface({
  children,
  variant = 'default',
  padding = 'lg',
  radius: radiusToken = 'lg',
  style,
  ...rest
}: SurfaceProps) {
  return (
    <View
      {...rest}
      style={[
        styles.surface,
        variant === 'raised' ? styles.raised : null,
        variant === 'accent' ? styles.accent : null,
        // `none` adds no padding at all, so paddings passed in `style` always apply.
        padding === 'none' ? null : { padding: space[padding] },
        { borderRadius: radius[radiusToken] },
        style,
      ]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  surface: {
    backgroundColor: colors.surface,
    borderWidth: layout.hairline,
    borderColor: colors.hairline,
    overflow: 'hidden',
  },
  raised: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.hairlineStrong,
  },
  accent: {
    backgroundColor: colors.accentDim,
    borderColor: colors.accentBorder,
  },
});
