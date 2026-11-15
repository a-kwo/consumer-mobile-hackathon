import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { colors, layout, radius, space, tones, type Tone } from '@/theme';

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
  /**
   * Tint. `neutral` for ordinary actions; `calm` and `energy` for the nudge
   * controls; `accent` for the one action you want noticed. @default 'neutral'
   */
  tone?: Tone;
  /** Height 34 (`sm`) or 42 (`md`). @default 'md' */
  size?: 'sm' | 'md';
  disabled?: boolean;
  /** Grow to share the row equally with sibling pills. */
  grow?: boolean;
  /** @default 'tap' */
  haptic?: HapticKind | false;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * A secondary action: a translucent capsule with a label and optional icon.
 *
 *   <PillButton icon="moon-outline" label="Calmer" tone="calm" onPress={calmer} />
 *   <PillButton icon="flash-outline" label="More energy" tone="energy" onPress={more} />
 *   <PillButton icon="share-outline" label="Share" size="sm" onPress={share} />
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
  const palette = tones[tone];
  const small = size === 'sm';
  const neutral = tone === 'neutral';
  const glyph = icon ? (
    <Icon color={neutral ? colors.text : palette.fg} name={icon} size={small ? 15 : 17} />
  ) : null;

  return (
    <PressableScale
      accessibilityLabel={accessibilityLabel ?? label}
      containerStyle={[grow ? styles.grow : null, style]}
      disabled={disabled}
      fill={grow}
      haptic={haptic}
      hitSlop={small ? 5 : 1}
      onPress={onPress}
      pressedStyle={{ backgroundColor: neutral ? colors.surfacePressed : palette.border }}
      style={[
        styles.pill,
        small ? styles.small : styles.medium,
        {
          backgroundColor: neutral ? colors.surface : palette.bg,
          borderColor: neutral ? colors.hairlineStrong : palette.border,
        },
      ]}
      testID={testID}>
      {iconPosition === 'leading' ? glyph : null}
      <AppText
        numberOfLines={1}
        style={[small ? styles.labelSmall : null, { color: neutral ? colors.text : palette.fg }]}
        variant="label">
        {label}
      </AppText>
      {iconPosition === 'trailing' ? glyph : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: layout.hairline,
  },
  medium: {
    height: 42,
    paddingHorizontal: space.lg + 2,
    gap: space.sm,
  },
  small: {
    height: 34,
    paddingHorizontal: space.md + 2,
    gap: 6,
  },
  labelSmall: {
    fontSize: 13,
    lineHeight: 17,
  },
  grow: {
    flex: 1,
  },
});
