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
import { usePlaybackProgress, useReplay } from '@/lib/score';
import { colors, layout, radius, shadows, space } from '@/theme';

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
/** Material 3 navigation bar height, used on Android until the real one is measured. */
const ANDROID_TAB_BAR_FALLBACK = 80;

/** The thin line along the bottom edge. Its own component so only it re-renders four times a second. */
function ReplayProgress() {
  const { positionMs, durationMs } = usePlaybackProgress();
  return (
    <ProgressBar
      accessibilityLabel="Replay progress"
      height={2}
      style={styles.progress}
      tone="accent"
      value={durationMs > 0 ? positionMs / durationMs : 0}
    />
  );
}

export type ReplayBarProps = {
  /** Where the bar sits: pass `position: 'absolute'` and a `bottom`. */
  style?: StyleProp<ViewStyle>;
};

/**
 * The compact "now replaying" bar: cover, the song and the cue it scored, a
 * playing or loading indicator, a progress line and a stop button. Renders
 * nothing while the replay is idle.
 */
export function ReplayBar({ style }: ReplayBarProps) {
  const replay = useReplay();
  if (replay.status === 'idle') return null;

  const item = replay.item;
  const loading = replay.status === 'loading';
  const title = item?.title ?? 'Loading the cue';
  const subtitle = item ? (item.subtitle ?? item.artist) : 'One moment';

  return (
    <View style={[styles.bar, style]} testID="replay-bar">
      <CoverArt
        radius={radius.xs}
        shadow={false}
        size={40}
        transitionMs={200}
        uri={item?.coverUrl}
      />
      <View style={styles.text}>
        <AppText numberOfLines={1} style={styles.title} variant="label">
          {title}
        </AppText>
        <AppText numberOfLines={1} variant="caption">
          {subtitle}
        </AppText>
      </View>
      <View style={styles.indicator}>
        {loading ? (
          <ActivityIndicator accessibilityLabel="Loading" color={colors.accent} size="small" />
        ) : (
          <EqualizerBars playing size={16} />
        )}
      </View>
      <IconButton
        accessibilityLabel="Stop replay"
        icon="stop"
        onPress={replay.stop}
        size="sm"
        testID="replay-stop"
      />
      <ReplayProgress />
    </View>
  );
}

/**
 * Extra space a scrolling screen should leave at its end while the replay bar
 * is showing, so the bar never hides the last rows. Zero while idle.
 */
export function useReplayBarInset(): number {
  const replay = useReplay();
  return replay.status === 'idle' ? 0 : REPLAY_BAR_HEIGHT + GAP;
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
 * after `NativeTabs`: it fills the navigator without taking touches and floats
 * the bar just above the tab bar on every tab.
 */
export function TabsReplayBar() {
  const insets = useSafeAreaInsets();
  const measured = useTabBarSpace();

  const fallback =
    insets.bottom +
    Platform.select({ ios: layout.tabBarHeightIOS, android: ANDROID_TAB_BAR_FALLBACK, default: 0 });
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
    borderRadius: radius.md,
    borderWidth: layout.hairline,
    borderColor: colors.hairlineStrong,
    // Opaque: the bar floats over lists, and text must not show through it.
    backgroundColor: '#1D1C25',
    overflow: 'hidden',
    ...shadows.raised,
  },
  text: {
    flex: 1,
    gap: 1,
  },
  title: {
    color: colors.text,
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
    backgroundColor: colors.hairline,
  },
});
