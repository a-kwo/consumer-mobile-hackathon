import { StyleSheet, Text, type TextProps, type TextStyle } from 'react-native';

import {
  fontFace,
  fontFaces,
  serifVariants,
  textColors,
  typography,
  type TextTone,
  type TextVariant,
} from '@/theme';

export type AppTextProps = TextProps & {
  /**
   * Type role. Fraunces: `wordmark`, `songTitle`, `screenTitle`, `entryTitle`,
   * `sceneLine`. Hanken Grotesk: `artist`, `body`, `button`, `meta`, `time`.
   * The first kit's names still work and map to these (see `typography`).
   * @default 'body'
   */
  variant?: TextVariant;
  /**
   * Colour role: `primary` (ink), `soft` (inkSoft) or `muted` (inkMuted).
   * Defaults to `muted` for `sceneLine`, `artist`, `meta`, `time` and their
   * older names, and `primary` for everything else.
   */
  tone?: TextTone;
  /** Use the italic face. Only Fraunces has one. */
  italic?: boolean;
  align?: TextStyle['textAlign'];
};

const defaultTone: Partial<Record<TextVariant, TextTone>> = {
  sceneLine: 'muted',
  artist: 'muted',
  meta: 'muted',
  time: 'muted',
  serifItalic: 'muted',
  caption: 'muted',
  overline: 'muted',
  numeric: 'muted',
};

const WEIGHTS: Record<string, number> = { normal: 400, bold: 700 };

/**
 * All text in Score. Never use a bare `<Text>`: it would fall back to the
 * system font. This applies the role, the ink colour steps and a cap on
 * Dynamic Type.
 *
 *   <AppText variant="songTitle" numberOfLines={2}>No Surprises</AppText>
 *   <AppText variant="sceneLine">A slow rainy walk, late at night</AppText>
 *   <AppText variant="meta">92 steps/min · Rain</AppText>
 *
 * Every weight of the two typefaces is a separate embedded family, so a
 * `fontWeight` or `fontStyle` in `style` is honoured by switching family
 * (to the nearest embedded face), never by letting the platform fake it.
 */
export function AppText({
  variant = 'body',
  tone,
  italic = false,
  align,
  style,
  maxFontSizeMultiplier = 1.3,
  ...rest
}: AppTextProps) {
  const flat: TextStyle = StyleSheet.flatten([typography[variant], style]) ?? {};
  const known = flat.fontFamily ? fontFaces[flat.fontFamily] : undefined;

  // Resolve the face unless the caller chose a family that is not ours.
  let face: TextStyle | null = null;
  if (known || !flat.fontFamily) {
    const kind = known?.kind ?? (serifVariants.has(variant) ? 'serif' : 'sans');
    const requested = flat.fontWeight;
    const weight =
      requested === undefined
        ? (known?.weight ?? 400)
        : (WEIGHTS[String(requested)] ?? Number(requested));
    const wantsItalic = italic || flat.fontStyle === 'italic' || !!known?.italic;
    face = {
      fontFamily: fontFace(kind, weight, wantsItalic),
      fontWeight: 'normal',
      fontStyle: 'normal',
    };
  }

  return (
    <Text
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      {...rest}
      style={[
        typography[variant],
        { color: textColors[tone ?? defaultTone[variant] ?? 'primary'] },
        align ? { textAlign: align } : null,
        style,
        face,
      ]}
    />
  );
}
