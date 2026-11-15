import { StyleSheet, type ViewStyle } from 'react-native';

/** Spacing scale, in points. Use these instead of literal numbers. */
export const space = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
  huge: 64,
} as const;

export type SpaceToken = keyof typeof space;

/** Corner radii. `pill` is for fully rounded controls. */
export const radius = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

export type RadiusToken = keyof typeof radius;

/**
 * Layout constants.
 *
 * Tab bar: screens should not use `tabBarHeightIOS` directly. `Screen` and
 * `useScreenInsets()` (src/components/ui/screen.tsx) already resolve the
 * space taken by the status bar, the tab bar and the home indicator on both
 * platforms. The constants here are the inputs to that calculation.
 */
export const layout = {
  /** Horizontal page margin. Works from 375 pt wide phones up. */
  screenPadding: 20,
  /** Content never grows wider than this, so large phones and tablets stay readable. */
  maxContentWidth: 560,
  /** Minimum touch target. */
  minTouch: 44,
  /** One physical pixel. */
  hairline: StyleSheet.hairlineWidth,
  /**
   * Height of the iOS tab bar above the home indicator. Only a floor for the
   * measured value: the native tabs give each tab its own safe area that
   * already includes the (floating, on iOS 26) tab bar.
   */
  tabBarHeightIOS: 49,
  /** Breathing room `Screen` leaves between the last content and the tab bar. */
  tabBarClearance: 16,
  /** Extra space at the end of a scrolling screen so the last row is not flush with the bar. */
  scrollEndPadding: 32,
} as const;

/**
 * Shadows and glows. These use `boxShadow`, which React Native draws on both
 * platforms under the New Architecture.
 */
export const shadows = {
  /** Lifted translucent panels and floating controls. */
  raised: {
    boxShadow: [
      { offsetX: 0, offsetY: 8, blurRadius: 24, spreadDistance: 0, color: 'rgba(0, 0, 0, 0.40)' },
    ],
  },
  /** The deep, soft shadow under cover art. */
  cover: {
    boxShadow: [
      { offsetX: 0, offsetY: 20, blurRadius: 48, spreadDistance: -8, color: 'rgba(0, 0, 0, 0.65)' },
    ],
  },
  /** Amber halo for the one primary control. */
  accentGlow: {
    boxShadow: [
      {
        offsetX: 0,
        offsetY: 6,
        blurRadius: 28,
        spreadDistance: 0,
        color: 'rgba(245, 168, 60, 0.38)',
      },
    ],
  },
} as const satisfies Record<string, ViewStyle>;

/** A coloured halo of any colour, for example around a live indicator. */
export function glow(color: string, blurRadius = 24): ViewStyle {
  return {
    boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius, spreadDistance: 0, color }],
  };
}
