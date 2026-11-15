import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, layout, sizes } from '@/theme';

import { AppText } from './app-text';
import { haptics } from './haptics';
import { TAB_BAR_OVERLAYS_SCREEN } from './screen';

/**
 * Score's tab bar: words only. 56 high with a hairline on top; the active tab
 * is in ink with a short underline, the others in inkMuted. No icons.
 *
 * Pass it to the JavaScript tabs as their `tabBar`:
 *
 *   <Tabs tabBar={(props) => <TabBar {...props} />}>
 *
 * It pads itself for the home indicator or the Android navigation bar. On iOS
 * it is drawn over the bottom of the screens; on Android it is laid out below
 * them. `useScreenInsets()` accounts for both, so screens do not need to know.
 */
export function TabBar({ state, descriptors, emitter, navigateToTab, insets }: BottomTabBarProps) {
  return (
    <View
      style={[
        styles.bar,
        TAB_BAR_OVERLAYS_SCREEN ? styles.overlay : null,
        { height: sizes.tabBar + insets.bottom, paddingBottom: insets.bottom },
      ]}
      testID="tab-bar">
      <View role="tablist" style={styles.tabs}>
        {state.routes.map((route, index) => {
          const focused = index === state.index;
          const { options } = descriptors[route.key];
          const label =
            typeof options.tabBarLabel === 'string'
              ? options.tabBarLabel
              : (options.title ?? route.name);

          const onPress = () => {
            const event = emitter.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              haptics.select();
              navigateToTab(route.key);
            }
          };

          return (
            <Pressable
              accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              key={route.key}
              onLongPress={() => emitter.emit({ type: 'tabLongPress', target: route.key })}
              onPress={onPress}
              style={styles.tab}
              testID={options.tabBarButtonTestID ?? `tab-${route.name}`}>
              <AppText
                maxFontSizeMultiplier={1.15}
                numberOfLines={1}
                style={focused ? styles.active : null}
                tone={focused ? 'primary' : 'muted'}
                variant="button">
                {label}
              </AppText>
              <View style={[styles.underline, focused ? null : styles.hidden]} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.paper,
    borderTopWidth: layout.hairline,
    borderTopColor: colors.hairline,
  },
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  tabs: {
    flex: 1,
    flexDirection: 'row',
    alignSelf: 'center',
    width: '100%',
    maxWidth: layout.maxContentWidth,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  active: {
    fontWeight: '600',
  },
  // Sits under the label without moving it: the label stays centred in the bar.
  underline: {
    position: 'absolute',
    bottom: 11,
    width: sizes.tabUnderline.width,
    height: sizes.tabUnderline.height,
    borderRadius: 1,
    backgroundColor: colors.ink,
  },
  hidden: {
    opacity: 0,
  },
});
