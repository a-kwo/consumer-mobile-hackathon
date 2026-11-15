import Ionicons from '@expo/vector-icons/Ionicons';

/**
 * Fonts the root layout loads before hiding the splash screen.
 *
 * On iOS and Android this is only the Ionicons glyph font, so icons never
 * flash in blank on first paint. Fraunces and Hanken Grotesk are not here:
 * the expo-font config plugin embeds them in the native app. (The web build
 * has no config plugin, so `kit-fonts.web.ts` adds the six text fonts.)
 */
export const kitFonts: Record<string, number | string> = {
  ...Ionicons.font,
};
