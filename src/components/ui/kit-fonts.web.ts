import Ionicons from '@expo/vector-icons/Ionicons';

/**
 * Web variant of `kit-fonts.ts`. Config plugins do not run on the web, so the
 * text fonts are loaded here under the same names the iOS build uses (see
 * `fonts` in src/theme/typography.ts).
 */
export const kitFonts: Record<string, number | string> = {
  ...Ionicons.font,
  'Fraunces-Regular': require('@expo-google-fonts/fraunces/400Regular/Fraunces_400Regular.ttf'),
  'Fraunces-Italic': require('@expo-google-fonts/fraunces/400Regular_Italic/Fraunces_400Regular_Italic.ttf'),
  'Fraunces-Medium': require('@expo-google-fonts/fraunces/500Medium/Fraunces_500Medium.ttf'),
  'HankenGrotesk-Regular': require('@expo-google-fonts/hanken-grotesk/400Regular/HankenGrotesk_400Regular.ttf'),
  'HankenGrotesk-Medium': require('@expo-google-fonts/hanken-grotesk/500Medium/HankenGrotesk_500Medium.ttf'),
  'HankenGrotesk-SemiBold': require('@expo-google-fonts/hanken-grotesk/600SemiBold/HankenGrotesk_600SemiBold.ttf'),
};
