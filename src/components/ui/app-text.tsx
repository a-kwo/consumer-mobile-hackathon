import { Text, type TextProps, type TextStyle } from 'react-native';

import {
  fonts,
  serifVariants,
  textColors,
  typography,
  type TextTone,
  type TextVariant,
} from '@/theme';

export type AppTextProps = TextProps & {
  /**
   * Type style. Serif (Instrument Serif): `displayLarge`, `displayMedium`,
   * `displaySmall`, `serifItalic`. System font: `title`, `body`, `label`,
   * `caption`, `overline` (upper case, letter-spaced), `numeric` (tabular digits).
   * @default 'body'
   */
  variant?: TextVariant;
  /**
   * Colour role. Defaults to `secondary` for `caption`, `tertiary` for
   * `overline` and `primary` for everything else.
   */
  tone?: TextTone;
  /** Use the italic face. On serif variants this switches to Instrument Serif Italic. */
  italic?: boolean;
  align?: TextStyle['textAlign'];
};

const defaultTone: Partial<Record<TextVariant, TextTone>> = {
  caption: 'secondary',
  overline: 'tertiary',
};

/**
 * All text in Score. Never use a bare `<Text>`: this applies the variant, the
 * off-white colour steps and a cap on Dynamic Type so title cards cannot
 * break the layout.
 *
 *   <AppText variant="overline">Now scoring</AppText>
 *   <AppText variant="displayLarge" numberOfLines={2}>Night Drive</AppText>
 *   <AppText variant="serifItalic" tone="secondary">slow rainy walk, late night</AppText>
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
  // The serif italic is its own font file, selected by family. Setting
  // `fontStyle: 'italic'` on it would make Android slant the glyphs twice.
  let face: TextStyle | null = null;
  if (serifVariants.has(variant)) {
    face = italic ? { fontFamily: fonts.serifItalic } : null;
  } else if (italic) {
    face = { fontStyle: 'italic' };
  }

  return (
    <Text
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      {...rest}
      style={[
        typography[variant],
        { color: textColors[tone ?? defaultTone[variant] ?? 'primary'] },
        face,
        align ? { textAlign: align } : null,
        style,
      ]}
    />
  );
}
