import Ionicons from '@expo/vector-icons/Ionicons';

/**
 * Web variant of `kit-fonts.ts`. Config plugins do not run on the web, so the
 * serif is loaded here under the same names the iOS build uses (see
 * `fonts` in src/theme/typography.ts).
 */
export const kitFonts: Record<string, number | string> = {
  ...Ionicons.font,
  'InstrumentSerif-Regular': require('@expo-google-fonts/instrument-serif/400Regular/InstrumentSerif_400Regular.ttf'),
  'InstrumentSerif-Italic': require('@expo-google-fonts/instrument-serif/400Regular_Italic/InstrumentSerif_400Regular_Italic.ttf'),
};
