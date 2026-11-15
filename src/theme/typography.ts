import { Platform, type TextStyle } from 'react-native';

/**
 * Font families: Fraunces for titles, Hanken Grotesk for everything else.
 *
 * Six static font files are embedded natively by the `expo-font` config
 * plugin in app.json, so nothing is loaded at runtime on iOS or Android:
 *
 * - iOS addresses an embedded font by its PostScript name, read from the
 *   file: `Fraunces-Medium`, `HankenGrotesk-SemiBold`, and so on.
 * - Android addresses it by the file name without the extension:
 *   `Fraunces_500Medium`, `HankenGrotesk_600SemiBold`.
 * - Web has no config plugin. `kit-fonts.web.ts` registers the six files
 *   under the iOS names, with a fallback stack until they arrive.
 *
 * Every weight is its own family. Never combine these families with
 * `fontWeight` or `fontStyle`: Android would thicken or slant the real
 * glyphs. Pick the face by family (`fonts.sansMedium`) or call
 * `fontFace('sans', 500)`. `AppText` does this for you: it reads any
 * `fontWeight` or `fontStyle` in its `style` and swaps the family instead.
 */
function family(ios: string, android: string, fallback: string): string {
  return Platform.select({ ios, android, default: `'${ios}', ${fallback}` });
}

const SERIF_FALLBACK = "'Iowan Old Style', Georgia, serif";
const SANS_FALLBACK = "system-ui, -apple-system, 'Segoe UI', sans-serif";

export const fonts = {
  /** Fraunces 400. */
  serif: family('Fraunces-Regular', 'Fraunces_400Regular', SERIF_FALLBACK),
  /** Fraunces 400 italic: the scene line. */
  serifItalic: family('Fraunces-Italic', 'Fraunces_400Regular_Italic', SERIF_FALLBACK),
  /** Fraunces 500: titles and the wordmark. */
  serifMedium: family('Fraunces-Medium', 'Fraunces_500Medium', SERIF_FALLBACK),
  /** Hanken Grotesk 400. */
  sans: family('HankenGrotesk-Regular', 'HankenGrotesk_400Regular', SANS_FALLBACK),
  /** Hanken Grotesk 500: buttons and tabs. */
  sansMedium: family('HankenGrotesk-Medium', 'HankenGrotesk_500Medium', SANS_FALLBACK),
  /** Hanken Grotesk 600: the active tab, emphasis. */
  sansSemiBold: family('HankenGrotesk-SemiBold', 'HankenGrotesk_600SemiBold', SANS_FALLBACK),
} as const;

export type FontKind = 'serif' | 'sans';

/**
 * The embedded family closest to a weight and style. Fraunces has 400, 400
 * italic and 500; Hanken Grotesk has 400, 500 and 600 and no italic.
 */
export function fontFace(kind: FontKind, weight: number = 400, italic: boolean = false): string {
  if (kind === 'serif') {
    if (italic) return fonts.serifItalic;
    return weight >= 500 ? fonts.serifMedium : fonts.serif;
  }
  if (weight >= 600) return fonts.sansSemiBold;
  return weight >= 500 ? fonts.sansMedium : fonts.sans;
}

/** What each embedded family is, so a face can be re-resolved from a family name. */
export const fontFaces: Readonly<
  Record<string, { kind: FontKind; weight: number; italic: boolean }>
> = {
  [fonts.serif]: { kind: 'serif', weight: 400, italic: false },
  [fonts.serifItalic]: { kind: 'serif', weight: 400, italic: true },
  [fonts.serifMedium]: { kind: 'serif', weight: 500, italic: false },
  [fonts.sans]: { kind: 'sans', weight: 400, italic: false },
  [fonts.sansMedium]: { kind: 'sans', weight: 500, italic: false },
  [fonts.sansSemiBold]: { kind: 'sans', weight: 600, italic: false },
};

/**
 * Text variants. The first group is the identity's type roles, named as the
 * plan names them. The second group keeps the first kit's variant names and
 * maps each to the nearest role. Text is sentence case everywhere: no variant
 * transforms case or adds tracking. Titles are set 0.01 em tight.
 */
export const typography = {
  // ── Type roles ─────────────────────────────────────────────────────────
  /** The "Score" wordmark. */
  wordmark: { fontFamily: fonts.serifMedium, fontSize: 22, lineHeight: 28, letterSpacing: -0.22 },
  /** Song title on Now. */
  songTitle: { fontFamily: fonts.serifMedium, fontSize: 34, lineHeight: 40, letterSpacing: -0.34 },
  /** Screen title: "Today's soundtrack". */
  screenTitle: { fontFamily: fonts.serifMedium, fontSize: 30, lineHeight: 34, letterSpacing: -0.3 },
  /** A soundtrack entry's generated title, and other list titles in the serif. */
  entryTitle: { fontFamily: fonts.serif, fontSize: 17, lineHeight: 22, letterSpacing: -0.17 },
  /** The scene, as a sentence: "A slow rainy walk, late at night". */
  sceneLine: { fontFamily: fonts.serifItalic, fontSize: 16, lineHeight: 20 },
  /** Artist name under a song title. */
  artist: { fontFamily: fonts.sans, fontSize: 16, lineHeight: 22 },
  /** Reason line and running text. */
  body: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 22 },
  /** Button labels and inactive tabs. */
  button: { fontFamily: fonts.sansMedium, fontSize: 14, lineHeight: 18 },
  /** Meta line: "92 steps/min · Rain". */
  meta: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 20 },
  /** Playback times: digits that do not jitter. */
  time: { fontFamily: fonts.sans, fontSize: 12, lineHeight: 16, fontVariant: ['tabular-nums'] },

  // ── Names kept from the first kit ──────────────────────────────────────
  /** Same as `songTitle`. */
  displayLarge: {
    fontFamily: fonts.serifMedium,
    fontSize: 34,
    lineHeight: 40,
    letterSpacing: -0.34,
  },
  /** Same as `screenTitle`. */
  displayMedium: {
    fontFamily: fonts.serifMedium,
    fontSize: 30,
    lineHeight: 34,
    letterSpacing: -0.3,
  },
  /** Same as `wordmark`: Fraunces 500 at 22, for a value or a small heading. */
  displaySmall: {
    fontFamily: fonts.serifMedium,
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.22,
  },
  /** Same as `sceneLine`. */
  serifItalic: { fontFamily: fonts.serifItalic, fontSize: 16, lineHeight: 20 },
  /** A row or panel title in the sans: Hanken Grotesk 500 at 16. */
  title: { fontFamily: fonts.sansMedium, fontSize: 16, lineHeight: 22 },
  /** Same as `button`. */
  label: { fontFamily: fonts.sansMedium, fontSize: 14, lineHeight: 18 },
  /** Same as `meta`. */
  caption: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 20 },
  /**
   * Same as `meta`. This was the upper-case, letter-spaced label of the first
   * kit; the identity has no such label, so it is plain sentence-case text.
   */
  overline: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 20 },
  /** Same as `time`. */
  numeric: { fontFamily: fonts.sans, fontSize: 12, lineHeight: 16, fontVariant: ['tabular-nums'] },
} as const satisfies Record<string, TextStyle>;

export type TextVariant = keyof typeof typography;

/** Variants set in Fraunces. */
export const serifVariants: ReadonlySet<TextVariant> = new Set<TextVariant>([
  'wordmark',
  'songTitle',
  'screenTitle',
  'entryTitle',
  'sceneLine',
  'displayLarge',
  'displayMedium',
  'displaySmall',
  'serifItalic',
]);
