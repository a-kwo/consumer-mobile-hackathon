import { ConvexProvider, ConvexReactClient } from 'convex/react';
import { useFonts } from 'expo-font';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
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

// The window behind every screen is the same near-black as the screens, so
// nothing lighter can flash through during a transition or a keyboard resize.
SystemUI.setBackgroundColorAsync(colors.bg).catch(() => {});

const convex = new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL!, {
  unsavedChangesWarning: false,
});

/** Score is dark only: one navigation theme, built on the tokens. */
const navigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.accent,
    background: colors.bg,
    card: colors.bg,
    text: colors.text,
    border: colors.hairline,
    notification: colors.accent,
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
          <ThemeProvider value={navigationTheme}> … </ThemeProvider>
              </ScoreProvider>
            ─────────────────────────────────────────────────────────────────
          */}
          <ThemeProvider value={navigationTheme}>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.bg },
              }}>
              <Stack.Screen name="(tabs)" />
              {/* Hidden design-kit preview: consumermobilehackathon://kit */}
              <Stack.Screen name="kit" />
            </Stack>
            <StatusBar style="light" />
          </ThemeProvider>
        </ScoreProvider>
      </ConvexProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
});
