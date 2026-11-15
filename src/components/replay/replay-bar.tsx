import { useEffect, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AppText,
  CoverArt,
  EqualizerBars,
  IconButton,
  ProgressBar,
  useScreenInsets,
} from '@/components/ui';
import { albumInk, INK_MUTED } from '@/lib/album-ink';
import { usePlaybackProgress, useReplay } from '@/lib/score';
import { colors, layout, radius, shadows, sizes, space } from '@/theme';

import { coverColorOf } from './cover-colors';
import {
  reportTabInset,
  reportTabScreenHeight,
  reportTabsContainerHeight,
  useTabBarSpace,
} from './tab-bar-space';

/** Height of the bar itself. */
export const REPLAY_BAR_HEIGHT = 58;
/** Gap between the bar and the tab bar (or the bottom safe area). */
const GAP = space.sm;
/** Tab bar height above the navigation bar, used on Android until the real space is measured. */
const ANDROID_TAB_BAR_FALLBACK = sizes.tabBar;

/** The thin line along the bottom edge. Its own component so only it re-renders four times a second. */
function ReplayProgress({ tint }: { tint: string }) {
  const { positionMs, durationMs } = usePlaybackProgress();
  return (
    <ProgressBar
      accessibilityLabel="Replay progress"
      height={sizes.progress}
      style={styles.progress}
      tint={tint}
      value={durationMs > 0 ? positionMs / durationMs : 0}
    />
  );
}

export type ReplayBarProps = {
  /** Where the bar sits: pass `position: 'absolute'` and a `bottom`. */
  style?: StyleProp<ViewStyle>;
};

/**
 * The compact "now replaying" bar: cover, the song and the entry it scored, a
 * playing or loading indicator, a progress line and a stop button. The
 * progress line and the equalizer take the song's album ink. Renders nothing
 * while the replay is idle.
 */
export function ReplayBar({ style }: ReplayBarProps) {
  const replay = useReplay();
  if (replay.status === 'idle') return null;

  const item = replay.item;
  const loading = replay.status === 'loading';
  const title = item?.title ?? 'Loading the track';
  const subtitle = item ? (item.subtitle ?? item.artist) : 'One moment';
  const tint = albumInk(coverColorOf(item?.deezerId), INK_MUTED);

  return (
    <View style={[styles.bar, style]} testID="replay-bar">
      <CoverArt
        radius={radius.thumb}
        shadow={false}
        size={40}
        transitionMs={200}
        uri={item?.coverUrl}
      />
      <View style={styles.text}>
        <AppText numberOfLines={1} variant="button">
          {title}
        </AppText>
        <AppText numberOfLines={1} variant="meta">
          {subtitle}
        </AppText>
      </View>
      <View style={styles.indicator}>
        {loading ? (
          <ActivityIndicator accessibilityLabel="Loading" color={colors.inkMuted} size="small" />
        ) : (
          <EqualizerBars playing size={16} tint={tint} />
        )}
      </View>
      <IconButton
        accessibilityLabel="Stop replay"
        icon="stop"
        onPress={replay.stop}
        size="sm"
        testID="replay-stop"
      />
      <ReplayProgress tint={tint} />
    </View>
  );
}

/**
 * Extra space a screen should leave at its bottom while the replay bar is
 * showing, so the bar never hides a control. Zero while idle.
 */
export function useReplayBarInset(): number {
  const replay = useReplay();
  return replay.status === 'idle' ? 0 : REPLAY_BAR_HEIGHT + GAP;
}

/**
 * Bottom padding for a scrolling list under the replay bar: the bar itself
 * plus room for the last row to rest clear of it. Zero while idle.
 */
export function useReplayBarListInset(): number {
  const inset = useReplayBarInset();
  return inset === 0 ? 0 : inset + space.xl;
}

/**
 * Wrap a tab screen in this so the replay bar knows where the tab bar starts.
 * It measures; it draws nothing of its own.
 */
export function TabBarProbe({ children }: { children: ReactNode }) {
  const insets = useScreenInsets();

  useEffect(() => {
    if (Platform.OS === 'ios') reportTabInset(insets.bottom);
  }, [insets.bottom]);

  return (
    <View
      onLayout={(event) => reportTabScreenHeight(event.nativeEvent.layout.height)}
      style={styles.fill}>
      {children}
    </View>
  );
}

/**
 * The replay bar for the tab navigator. Mount it once in the tabs layout,
 * after the tabs: it fills the navigator without taking touches and floats
 * the bar just above the tab bar on every tab.
 */
export function TabsReplayBar() {
  const insets = useSafeAreaInsets();
  const measured = useTabBarSpace();

  // The tab bar is 56 high on every platform and pads itself for the home
  // indicator or the navigation bar.
  const fallback =
    insets.bottom + Platform.select({ android: ANDROID_TAB_BAR_FALLBACK, default: sizes.tabBar });
  const bottom = (measured ?? fallback) + GAP;

  return (
    <View
      onLayout={(event) => reportTabsContainerHeight(event.nativeEvent.layout.height)}
      style={[StyleSheet.absoluteFill, styles.overlay]}>
      <View style={[styles.floating, { bottom }]}>
        <ReplayBar style={styles.capped} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  overlay: {
    pointerEvents: 'box-none',
  },
  floating: {
    position: 'absolute',
    left: space.md,
    right: space.md,
    alignItems: 'center',
    pointerEvents: 'box-none',
  },
  capped: {
    width: '100%',
    maxWidth: layout.maxContentWidth,
  },
  bar: {
    height: REPLAY_BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingLeft: space.sm + 1,
    paddingRight: space.md,
    borderRadius: radius.control,
    borderWidth: layout.hairline,
    borderColor: colors.hairline,
    backgroundColor: colors.paperRaised,
    overflow: 'hidden',
    ...shadows.raised,
  },
  text: {
    flex: 1,
  },
  indicator: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progress: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 0,
  },
});
