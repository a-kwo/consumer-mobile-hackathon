import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';

import { colors, layout, radius, space, type RadiusToken, type SpaceToken } from '@/theme';

export type SurfaceProps = Omit<ViewProps, 'style'> & {
  children?: ReactNode;
  /**
   * `default` is paperRaised (a sheet on the page). `raised` adds a hairline
   * edge. `accent` is paperSunk, the fill of controls. (Names kept from the
   * first kit.) @default 'default'
   */
  variant?: 'default' | 'raised' | 'accent';
  /** Inner padding, as a spacing token. @default 'lg' */
  padding?: SpaceToken;
  /** Corner radius, as a radius token. @default 'md' (14) */
  radius?: RadiusToken;
  style?: StyleProp<ViewStyle>;
};

/**
 * A panel: a lighter sheet of paper on the page. Use it for things that are
 * genuinely grouped (a set of sliders, a notice). Lists do not need one: rows
 * sit straight on the paper, separated by hairlines.
 *
 *   <Surface style={{ gap: space.md }}>…</Surface>
 */
export function Surface({
  children,
  variant = 'default',
  padding = 'lg',
  radius: radiusToken = 'md',
  style,
  ...rest
}: SurfaceProps) {
  return (
    <View
      {...rest}
      style={[
        styles.surface,
        variant === 'raised' ? styles.raised : null,
        variant === 'accent' ? styles.sunk : null,
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
    backgroundColor: colors.paperRaised,
    overflow: 'hidden',
  },
  raised: {
    borderWidth: layout.hairline,
    borderColor: colors.hairline,
  },
  sunk: {
    backgroundColor: colors.paperSunk,
  },
});
