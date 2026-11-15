import Ionicons from '@expo/vector-icons/Ionicons';

/**
 * Fonts the root layout loads before hiding the splash screen.
 *
 * On iOS and Android this is only the Ionicons glyph font, so icons never
 * flash in blank on first paint. Instrument Serif is not here: the expo-font
 * config plugin embeds it in the native app. (The web build has no config
 * plugin, so `kit-fonts.web.ts` adds the two serif files.)
 */
export const kitFonts: Record<string, number | string> = {
  ...Ionicons.font,
};
