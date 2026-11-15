import type { ViewStyle } from 'react-native';

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

/**
 * Corner radii. The identity uses three: 4 for list thumbnails, 6 for the
 * cover, 14 for buttons and panels. `pill` is only for circles (play, skip,
 * avatars); nothing in the kit is a pill-shaped button.
 */
export const radius = {
  /** List thumbnails. */
  xs: 4,
  /** The cover. */
  sm: 6,
  /** Buttons, controls, panels. */
  md: 14,
  lg: 14,
  xl: 20,
  pill: 999,
  // The same values, named for what they are.
  thumb: 4,
  cover: 6,
  control: 14,
} as const;

export type RadiusToken = keyof typeof radius;

/** Fixed sizes from the identity's shape table. Every touch target is at least 44 high. */
export const sizes = {
  /** Cover on Now. */
  cover: 272,
  /** Cover thumbnail in lists. */
  thumb: 48,
  /** Soundtrack cover beside the screen title. */
  soundtrackCover: 116,
  /** Play button: a circle in ink. */
  play: 60,
  /** Skip button: a circle in paperSunk. */
  skip: 48,
  /** Calmer, More energy and other text buttons. */
  control: 48,
  /** Primary button (Share). */
  primary: 44,
  /** Progress bar thickness. */
  progress: 2,
  /** Tab bar, above the home indicator or navigation bar. */
  tabBar: 56,
  /** Underline of the active tab. */
  tabUnderline: { width: 16, height: 2 },
} as const;

/**
 * Layout constants.
 *
 * Tab bar: screens do not use `tabBarHeight` directly. `Screen` and
 * `useScreenInsets()` (src/components/ui/screen.tsx) resolve the space taken
 * by the status bar, the tab bar and the home indicator on both platforms.
 */
export const layout = {
  /** Horizontal page margin. */
  screenPadding: 24,
  /** Content never grows wider than this, so large phones and tablets stay readable. */
  maxContentWidth: 560,
  /** Minimum touch target. */
  minTouch: 44,
  /** Thickness of dividers and the tab bar's top rule: one point, in `colors.hairline`. */
  hairline: 1,
  /** Height of the tab bar above the home indicator or navigation bar. */
  tabBarHeight: sizes.tabBar,
  /** @deprecated Same as `tabBarHeight`; the bar is the same on both platforms now. */
  tabBarHeightIOS: sizes.tabBar,
  /** Breathing room `Screen` leaves between the last content and the tab bar. */
  tabBarClearance: 16,
  /** Extra space at the end of a scrolling screen so the last row is not flush with the bar. */
  scrollEndPadding: 32,
} as const;

/**
 * Shadows. Warm and soft, never a glow. These use `boxShadow`, which React
 * Native draws on both platforms under the New Architecture.
 */
export const shadows = {
  /** The cover on Now: a long soft shadow plus a tight contact shadow. */
  cover: {
    boxShadow: [
      {
        offsetX: 0,
        offsetY: 22,
        blurRadius: 44,
        spreadDistance: 0,
        color: 'rgba(74, 52, 30, 0.18)',
      },
      { offsetX: 0, offsetY: 2, blurRadius: 6, spreadDistance: 0, color: 'rgba(74, 52, 30, 0.14)' },
    ],
  },
  /** Something that floats over the page: the replay bar, a sheet. */
  raised: {
    boxShadow: [
      {
        offsetX: 0,
        offsetY: 10,
        blurRadius: 24,
        spreadDistance: 0,
        color: 'rgba(74, 52, 30, 0.14)',
      },
      { offsetX: 0, offsetY: 1, blurRadius: 3, spreadDistance: 0, color: 'rgba(74, 52, 30, 0.12)' },
    ],
  },
  /** @deprecated The identity has no glows. Kept so existing code compiles; draws nothing. */
  accentGlow: {},
} as const satisfies Record<string, ViewStyle>;

/** @deprecated The identity has no glows. Kept so existing code compiles; returns no style. */
export function glow(_color?: string, _blurRadius?: number): ViewStyle {
  return {};
}
