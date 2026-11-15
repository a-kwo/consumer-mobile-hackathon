import { NativeTabs } from 'expo-router/native-tabs';

import { TabsReplayBar } from '@/components/replay';
import { TabBarInsetProvider } from '@/components/ui';
import { colors } from '@/theme';

/** Unselected tab colour: the secondary text step, as a solid for the native bar. */
const IDLE = '#96938E';

/**
 * The four tabs, in the system tab bar of each platform: a floating Liquid
 * Glass bar on iOS 26, a Material bar on Android.
 *
 * Icons are SF Symbols on iOS (`sf`) and Material Symbols on Android (`md`).
 *
 * `TabBarInsetProvider` tells `Screen` and `useScreenInsets()` that they are
 * inside the tabs, which is how screens clear the tab bar on both platforms.
 */
export default function TabsLayout() {
  return (
    <TabBarInsetProvider>
      <NativeTabs
        // iOS 26 draws the bar itself from the dark content behind it; these
        // colour the bar on Android and on iOS 18 and earlier.
        backgroundColor={colors.bg}
        blurEffect="systemChromeMaterialDark"
        disableTransparentOnScrollEdge
        iconColor={{ default: IDLE, selected: colors.accent }}
        indicatorColor={colors.accentDim}
        labelStyle={{ default: { color: IDLE }, selected: { color: colors.accent } }}
        labelVisibilityMode="labeled"
        rippleColor={colors.surfacePressed}
        tintColor={colors.accent}>
        <NativeTabs.Trigger name="index">
          <NativeTabs.Trigger.Label>Now</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon md="graphic_eq" sf="waveform" />
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="simulator">
          <NativeTabs.Trigger.Label>Simulator</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon md="tune" sf="slider.horizontal.3" />
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="ost">
          <NativeTabs.Trigger.Label>Soundtrack</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon md="queue_music" sf="music.note.list" />
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="feed">
          <NativeTabs.Trigger.Label>Friends</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon
            md="group"
            sf={{ default: 'person.2', selected: 'person.2.fill' }}
          />
        </NativeTabs.Trigger>
      </NativeTabs>
      {/* Floats above the tab bar on every tab while a replay plays; takes no touches otherwise. */}
      <TabsReplayBar />
    </TabBarInsetProvider>
  );
}
