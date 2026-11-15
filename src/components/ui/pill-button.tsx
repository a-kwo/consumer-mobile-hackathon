import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, sizes, space, type Tone } from '@/theme';

import { AppText } from './app-text';
import type { HapticKind } from './haptics';
import { Icon, type IconName } from './icon';
import { PressableScale } from './pressable-scale';

export type PillButtonProps = {
  label: string;
  icon?: IconName;
  /** @default 'leading' */
  iconPosition?: 'leading' | 'trailing';
  onPress?: () => void;
  /** Only `danger` changes anything (the label turns earth red). @default 'neutral' */
  tone?: Tone;
  /** 48 high (`md`) or 36 high (`sm`, with a 44 pt touch target). @default 'md' */
  size?: 'sm' | 'md';
  disabled?: boolean;
  /** Grow to share the row equally with sibling buttons. */
  grow?: boolean;
  /** @default 'tap' */
  haptic?: HapticKind | false;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * The secondary text button: paperSunk fill, ink label, radius 14, no
 * outline. Calmer and More energy are two of these with `grow`, either side
 * of play and skip. (The name is kept from the first kit; it is not a pill.)
 *
 *   <PillButton label="Calmer" grow onPress={calmer} />
 *   <PillButton label="More energy" grow onPress={more} />
 *   <PillButton icon="refresh" label="Retry" size="sm" onPress={retry} />
 */
export function PillButton({
  label,
  icon,
  iconPosition = 'leading',
  onPress,
  tone = 'neutral',
  size = 'md',
  disabled,
  grow = false,
  haptic = 'tap',
  accessibilityLabel,
  style,
  testID,
}: PillButtonProps) {
  const small = size === 'sm';
  const foreground = tone === 'danger' ? colors.danger : colors.ink;
  const glyph = icon ? <Icon color={foreground} name={icon} size={small ? 15 : 17} /> : null;

  return (
    <PressableScale
      accessibilityLabel={accessibilityLabel ?? label}
      containerStyle={[grow ? styles.grow : null, style]}
      disabled={disabled}
      fill={grow}
      haptic={haptic}
      hitSlop={small ? 4 : 0}
      onPress={onPress}
      pressedStyle={styles.pressed}
      style={[styles.button, small ? styles.small : styles.medium, grow ? styles.tight : null]}
      testID={testID}>
      {iconPosition === 'leading' ? glyph : null}
      <AppText
        adjustsFontSizeToFit
        minimumFontScale={0.85}
        numberOfLines={1}
        style={[small ? styles.labelSmall : null, { color: foreground }]}
        variant="button">
        {label}
      </AppText>
      {iconPosition === 'trailing' ? glyph : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.paperSunk,
  },
  pressed: {
    backgroundColor: colors.paperPressed,
  },
  medium: {
    height: sizes.control,
    paddingHorizontal: space.lg,
    gap: space.sm,
    borderRadius: radius.control,
  },
  small: {
    height: 36,
    paddingHorizontal: space.md,
    gap: 6,
    borderRadius: 10,
  },
  labelSmall: {
    fontSize: 13,
  },
  grow: {
    flex: 1,
  },
  // Sharing a row, the width comes from the row, so the side padding can be small.
  tight: {
    paddingHorizontal: space.sm,
  },
});
