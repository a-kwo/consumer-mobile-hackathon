import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { colors, layout } from '@/theme';

import type { HapticKind } from './haptics';
import { Icon, type IconName } from './icon';
import { PressableScale } from './pressable-scale';

export type IconButtonProps = {
  icon: IconName;
  /** Required: an icon alone says nothing to a screen reader. */
  accessibilityLabel: string;
  onPress?: () => void;
  /** Diameter: `sm` 36, `md` 44, `lg` 56. @default 'md' */
  size?: 'sm' | 'md' | 'lg';
  /**
   * `surface` is a translucent disc, `ghost` has no fill until pressed,
   * `accent` is filled amber. @default 'surface'
   */
  variant?: 'surface' | 'ghost' | 'accent';
  /** Show the on state (amber tint), for toggles. */
  selected?: boolean;
  disabled?: boolean;
  /** @default 'tap' */
  haptic?: HapticKind | false;
  /** Layout of the touch target, for example a margin. */
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

const DIAMETER = { sm: 36, md: 44, lg: 56 } as const;
const GLYPH = { sm: 18, md: 21, lg: 26 } as const;

/**
 * A round icon control: skip, share, close, back.
 *
 *   <IconButton icon="play-skip-forward" accessibilityLabel="Skip this cue" onPress={skip} />
 *   <IconButton icon="share-outline" variant="ghost" size="sm" accessibilityLabel="Share" />
 */
export function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  size = 'md',
  variant = 'surface',
  selected = false,
  disabled,
  haptic = 'tap',
  style,
  testID,
}: IconButtonProps) {
  const diameter = DIAMETER[size];

  let fill: ViewStyle = styles.surface;
  let pressed: ViewStyle = styles.surfacePressed;
  let glyph: string = colors.text;
  if (variant === 'accent') {
    fill = styles.accent;
    pressed = styles.accentPressed;
    glyph = colors.textOnAccent;
  } else if (selected) {
    fill = styles.selected;
    pressed = styles.selectedPressed;
    glyph = colors.accent;
  } else if (variant === 'ghost') {
    fill = styles.ghost;
    pressed = styles.ghostPressed;
  }

  return (
    <PressableScale
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected }}
      containerStyle={style}
      disabled={disabled}
      haptic={haptic}
      hitSlop={size === 'sm' ? 6 : 2}
      onPress={onPress}
      pressedStyle={pressed}
      scaleTo={0.92}
      style={[
        styles.button,
        { width: diameter, height: diameter, borderRadius: diameter / 2 },
        fill,
      ]}
      testID={testID}>
      <Icon color={glyph} name={icon} size={GLYPH[size]} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: layout.hairline,
    borderColor: colors.transparent,
  },
  surface: {
    backgroundColor: colors.surface,
    borderColor: colors.hairline,
  },
  surfacePressed: {
    backgroundColor: colors.surfacePressed,
  },
  ghost: {
    backgroundColor: colors.transparent,
  },
  ghostPressed: {
    backgroundColor: colors.surface,
  },
  accent: {
    backgroundColor: colors.accent,
  },
  accentPressed: {
    backgroundColor: colors.accentBright,
  },
  selected: {
    backgroundColor: colors.accentDim,
    borderColor: colors.accentBorder,
  },
  selectedPressed: {
    backgroundColor: 'rgba(245, 168, 60, 0.24)',
  },
});
