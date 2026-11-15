import { createContext, use, type ReactNode } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { initialWindowMetrics, useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, layout, space } from '@/theme';

import { AmbientBackground } from './ambient-background';

const InsideTabsContext = createContext(false);

/**
 * Marks everything below it as living inside the tab navigator. The tabs
 * layout wraps `NativeTabs` in this once; screens never need it.
 */
export function TabBarInsetProvider({ children }: { children: ReactNode }) {
  return <InsideTabsContext value={true}>{children}</InsideTabsContext>;
}

/** Home-indicator height of the device, measured once at launch. */
const HOME_INDICATOR = initialWindowMetrics?.insets.bottom ?? 0;

export type ScreenInsets = {
  /** Space taken by the status bar or Dynamic Island. */
  top: number;
  /** Space taken at the bottom by the tab bar and the home indicator or navigation bar. */
  bottom: number;
};

/**
 * The space system chrome takes at the top and bottom of the current screen,
 * with the tab bar already accounted for on both platforms:
 *
 * - iOS: the tab bar floats over the content, so `bottom` is the tab bar plus
 *   the home indicator. Each native tab has its own safe area that reports
 *   this; `layout.tabBarHeightIOS` is only a floor.
 * - Android: the native tabs already lay the screen out above the tab bar and
 *   the navigation bar, so `bottom` is 0 inside a tab.
 * - Outside the tabs (a pushed screen, the kit preview): the plain safe area.
 *
 * `Screen` applies these for you. Call this only for content you position
 * yourself: an absolutely placed control, or the `contentContainerStyle` of
 * your own `FlatList` inside `<Screen edges="none">`.
 */
export function useScreenInsets(): ScreenInsets {
  const insets = useSafeAreaInsets();
  const insideTabs = use(InsideTabsContext);

  let bottom = insets.bottom;
  if (insideTabs && Platform.OS === 'ios') {
    bottom = Math.max(insets.bottom, HOME_INDICATOR + layout.tabBarHeightIOS);
  } else if (insideTabs && Platform.OS === 'android') {
    bottom = 0;
  }
  return { top: insets.top, bottom };
}

export type ScreenProps = {
  children?: ReactNode;
  /** Cover art for the ambient wash behind the screen. Omit for the quiet default gradient. */
  coverUrl?: string | null;
  /** Make the content scroll vertically. A fixed screen fills the space between the bars. @default false */
  scroll?: boolean;
  /** Apply the standard horizontal page margin. @default true */
  padded?: boolean;
  /**
   * Which system insets to pad for. Use `'none'` when a child (your own list)
   * handles them with `useScreenInsets()`. @default 'both'
   */
  edges?: 'both' | 'top' | 'bottom' | 'none';
  /** Style of the content column: `gap`, `justifyContent`, and so on. */
  contentStyle?: StyleProp<ViewStyle>;
  /** Extra props for the scroll view when `scroll` is set (for example `refreshControl`). */
  scrollViewProps?: Omit<ScrollViewProps, 'children' | 'contentContainerStyle' | 'style'>;
  testID?: string;
};

/**
 * The frame of every screen. It draws the `AmbientBackground`, keeps content
 * clear of the status bar, the tab bar and the home indicator on both
 * platforms, applies the page margin and caps the content width on large
 * devices.
 *
 *   // Fixed layout (Now): fills the space between the bars.
 *   <Screen coverUrl={track?.coverUrl} contentStyle={{ justifyContent: 'space-between' }}>…</Screen>
 *
 *   // Scrolling layout (Soundtrack, Friends, Simulator).
 *   <Screen scroll contentStyle={{ gap: space.xl }}>…</Screen>
 */
export function Screen({
  children,
  coverUrl,
  scroll = false,
  padded = true,
  edges = 'both',
  contentStyle,
  scrollViewProps,
  testID,
}: ScreenProps) {
  const insets = useScreenInsets();
  const padTop = edges === 'both' || edges === 'top';
  const padBottom = edges === 'both' || edges === 'bottom';

  const padding: ViewStyle = {
    paddingTop: padTop ? insets.top + space.md : 0,
    paddingBottom: padBottom
      ? insets.bottom + layout.tabBarClearance + (scroll ? layout.scrollEndPadding : 0)
      : 0,
    paddingHorizontal: padded ? layout.screenPadding : 0,
  };

  return (
    <View collapsable={false} style={styles.root} testID={testID}>
      <AmbientBackground coverUrl={coverUrl} />
      {scroll ? (
        <ScrollView
          // Insets are applied as padding above, identically on both platforms.
          contentInsetAdjustmentBehavior="never"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          {...scrollViewProps}
          contentContainerStyle={[styles.scrollContent, padding]}
          style={styles.fill}>
          <View style={[styles.column, styles.grow, contentStyle]}>{children}</View>
        </ScrollView>
      ) : (
        <View style={[styles.fill, padding]}>
          <View style={[styles.column, styles.fill, contentStyle]}>{children}</View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  fill: {
    flex: 1,
  },
  grow: {
    flexGrow: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  column: {
    width: '100%',
    maxWidth: layout.maxContentWidth,
    alignSelf: 'center',
  },
});
