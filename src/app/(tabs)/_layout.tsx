import { Tabs } from 'expo-router/js-tabs';

import { TabsReplayBar } from '@/components/replay';
import { TabBar, TabBarInsetProvider } from '@/components/ui';
import { colors } from '@/theme';

/**
 * The four tabs: Scene (the landing route, `/`), Now (`/now`), Soundtrack and
 * Friends. These are Expo Router's JavaScript tabs, because the tab bar
 * is Score's own (`TabBar`: words only, 56 high, a hairline on top, the active
 * tab in ink with a short underline) and the native tab bar cannot be drawn
 * that way.
 *
 * `TabBarInsetProvider` tells `Screen` and `useScreenInsets()` that they are
 * inside the tabs, which is how screens clear the tab bar on both platforms.
 */
export default function TabsLayout() {
  return (
    <TabBarInsetProvider>
      <Tabs
        screenOptions={{
          headerShown: false,
          // Tab content dissolves rather than cuts, which also carries the move from Scene to Now.
          animation: 'fade',
          sceneStyle: { backgroundColor: colors.paper },
        }}
        tabBar={(props) => <TabBar {...props} />}>
        <Tabs.Screen name="index" options={{ title: 'Scene' }} />
        <Tabs.Screen name="now" options={{ title: 'Now' }} />
        <Tabs.Screen name="ost" options={{ title: 'Soundtrack' }} />
        <Tabs.Screen name="feed" options={{ title: 'Friends' }} />
      </Tabs>
      {/* Floats above the tab bar on every tab while a replay plays; takes no touches otherwise. */}
      <TabsReplayBar />
    </TabBarInsetProvider>
  );
}
