import Ionicons from '@expo/vector-icons/Ionicons';
import Constants, { ExecutionEnvironment } from 'expo-constants';

import { fonts } from '@/theme';

/**
 * Fonts the root layout loads before hiding the splash screen.
 *
 * In a built app this is only the Ionicons glyph font, so icons never flash in
 * blank on first paint: Fraunces and Hanken Grotesk are embedded natively by
 * the expo-font config plugin. (The web build has no config plugin, so
 * `kit-fonts.web.ts` adds the six text fonts.)
 *
 * Expo Go has no embedded fonts either, so when the app runs there the six
 * text fonts are loaded at runtime under the same family names the theme uses
 * on this platform. That lets the app run on a phone with `npx expo start --go`
 * and no native build.
 */
const inExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

const expoGoTextFonts: Record<string, number> = inExpoGo
  ? {
      [fonts.serif]: require('@expo-google-fonts/fraunces/400Regular/Fraunces_400Regular.ttf'),
      [fonts.serifItalic]: require('@expo-google-fonts/fraunces/400Regular_Italic/Fraunces_400Regular_Italic.ttf'),
      [fonts.serifMedium]: require('@expo-google-fonts/fraunces/500Medium/Fraunces_500Medium.ttf'),
      [fonts.sans]: require('@expo-google-fonts/hanken-grotesk/400Regular/HankenGrotesk_400Regular.ttf'),
      [fonts.sansMedium]: require('@expo-google-fonts/hanken-grotesk/500Medium/HankenGrotesk_500Medium.ttf'),
      [fonts.sansSemiBold]: require('@expo-google-fonts/hanken-grotesk/600SemiBold/HankenGrotesk_600SemiBold.ttf'),
    }
  : {};

export const kitFonts: Record<string, number | string> = {
  ...Ionicons.font,
  ...expoGoTextFonts,
};
