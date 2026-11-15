import { Platform, type TextStyle } from 'react-native';

/**
 * Font families.
 *
 * Instrument Serif (regular and italic) is embedded natively by the
 * `expo-font` config plugin in app.json, so there is nothing to load at
 * runtime on iOS or Android:
 *
 * - iOS addresses an embedded font by its PostScript name, read from the
 *   font file: `InstrumentSerif-Regular`, `InstrumentSerif-Italic`.
 * - Android addresses it by the file name without the extension:
 *   `InstrumentSerif_400Regular`, `InstrumentSerif_400Regular_Italic`.
 * - Web has no config plugin. `loadWebFonts` registers the two files under
 *   the iOS names, with a serif fallback until they arrive.
 *
 * The italic is a separate face. Never combine these families with
 * `fontStyle: 'italic'` or a `fontWeight` other than 400: Android would
 * synthesise a slant or a bold on top of the real glyphs. Use
 * `fonts.serifItalic` (or `<AppText italic>`) instead.
 */
export const fonts = {
  serif: Platform.select({
    ios: 'InstrumentSerif-Regular',
    android: 'InstrumentSerif_400Regular',
    default: "'InstrumentSerif-Regular', 'Iowan Old Style', Georgia, serif",
  }),
  serifItalic: Platform.select({
    ios: 'InstrumentSerif-Italic',
    android: 'InstrumentSerif_400Regular_Italic',
    default: "'InstrumentSerif-Italic', 'Iowan Old Style', Georgia, serif",
  }),
  /** `undefined` selects the system font (SF Pro on iOS, Roboto on Android). */
  sans: undefined,
} as const;

/**
 * Text variants. Titles and scene labels are set in the serif, like title
 * cards. Interface text is the system font. `overline` is the film-credits
 * label: upper case, letter-spaced, low contrast ("NOW SCORING", "CUE 07").
 */
export const typography = {
  /** Hero title card: the song title on Now, the day's title on the soundtrack. */
  displayLarge: {
    fontFamily: fonts.serif,
    fontSize: 44,
    lineHeight: 48,
    letterSpacing: -0.6,
  },
  /** Screen titles and secondary title cards. */
  displayMedium: {
    fontFamily: fonts.serif,
    fontSize: 32,
    lineHeight: 36,
    letterSpacing: -0.3,
  },
  /** Serif at list scale: a cue's generated title, a friend's soundtrack name. */
  displaySmall: {
    fontFamily: fonts.serif,
    fontSize: 24,
    lineHeight: 28,
    letterSpacing: -0.1,
  },
  /** Scene labels and the reason line: "slow rainy walk in the city, late night". */
  serifItalic: {
    fontFamily: fonts.serifItalic,
    fontSize: 20,
    lineHeight: 26,
  },
  title: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400',
  },
  /** Control labels: buttons, chips, segmented options. */
  label: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  caption: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '400',
  },
  /** Film-credits label. Always upper case and letter-spaced. */
  overline: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },
  /** Timers, BPM, counts: digits that must not jitter as they change. */
  numeric: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
} as const satisfies Record<string, TextStyle>;

export type TextVariant = keyof typeof typography;

/** Variants set in Instrument Serif. Used by `AppText` to resolve the italic face. */
export const serifVariants: ReadonlySet<TextVariant> = new Set<TextVariant>([
  'displayLarge',
  'displayMedium',
  'displaySmall',
  'serifItalic',
]);
