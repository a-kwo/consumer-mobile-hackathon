import { ConvexProvider, ConvexReactClient } from 'convex/react';
import { useFonts } from 'expo-font';
import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { kitFonts } from '@/components/ui';
import { ScoreProvider } from '@/lib/score';
import { colors } from '@/theme';

// Hold the native splash until the icon font is ready, then fade it out.
SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ duration: 400, fade: true });

// The window behind every screen is the same paper as the screens, so nothing
// else can flash through during a transition or a keyboard resize.
SystemUI.setBackgroundColorAsync(colors.paper).catch(() => {});

const convex = new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL!, {
  unsavedChangesWarning: false,
});

/** Score is light only: one navigation theme, paper and ink. */
const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.ink,
    background: colors.paper,
    card: colors.paper,
    text: colors.ink,
    border: colors.hairline,
    notification: colors.ink,
  },
};

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(kitFonts);

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hide();
  }, [fontsLoaded, fontError]);

  return (
    <GestureHandlerRootView style={styles.root}>
      <ConvexProvider client={convex}>
        <ScoreProvider>
          <ThemeProvider value={navigationTheme}>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.paper },
              }}>
              <Stack.Screen name="(tabs)" />
              {/* A friend's soundtrack, pushed from the Friends tab. */}
              <Stack.Screen name="friend/[deviceId]" />
              {/* The share card and the profile editor open as modals. */}
              <Stack.Screen name="share" options={{ presentation: 'modal' }} />
              <Stack.Screen name="profile" options={{ presentation: 'modal' }} />
              {/* Hidden design-kit preview: consumermobilehackathon://kit */}
              <Stack.Screen name="kit" />
            </Stack>
            {/* Dark status bar content, for the paper ground. */}
            <StatusBar style="dark" />
          </ThemeProvider>
        </ScoreProvider>
      </ConvexProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.paper,
  },
});
