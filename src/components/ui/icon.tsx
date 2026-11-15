import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import type { StyleProp, TextStyle } from 'react-native';

import { textColors, type TextTone } from '@/theme';

/** Any Ionicons glyph name. The kit uses Ionicons everywhere so iOS and Android match. */
export type IconName = ComponentProps<typeof Ionicons>['name'];

export type IconProps = {
  name: IconName;
  /** @default 20 */
  size?: number;
  /** Colour role. Ignored when `color` is set. @default 'primary' */
  tone?: TextTone;
  /** An explicit colour, for the rare case a tone does not fit. */
  color?: string;
  style?: StyleProp<TextStyle>;
};

/**
 * An Ionicons glyph in ink (or a quieter ink role). Use icons sparingly: the
 * identity prefers words, and the tab bar has none.
 *
 *   <Icon name="rainy-outline" size={16} tone="muted" />
 */
export function Icon({ name, size = 20, tone = 'primary', color, style }: IconProps) {
  return <Ionicons name={name} size={size} color={color ?? textColors[tone]} style={style} />;
}
