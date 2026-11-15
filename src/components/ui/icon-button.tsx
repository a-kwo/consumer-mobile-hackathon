import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { colors, sizes } from '@/theme';

import type { HapticKind } from './haptics';
import { Icon, type IconName } from './icon';
import { PressableScale } from './pressable-scale';

export type IconButtonProps = {
  icon: IconName;
  /** Required: an icon alone says nothing to a screen reader. */
  accessibilityLabel: string;
  onPress?: () => void;
  /** Diameter: `sm` 36, `md` 48 (the skip button), `lg` 60. @default 'md' */
  size?: 'sm' | 'md' | 'lg';
  /**
   * `surface` is a paperSunk circle with an ink glyph, `ghost` has no fill
   * until pressed, `accent` is an ink circle with a paper glyph.
   * @default 'surface'
   */
  variant?: 'surface' | 'ghost' | 'accent';
  /** Show the on state (ink fill, paper glyph), for toggles. */
  selected?: boolean;
  disabled?: boolean;
  /** @default 'tap' */
  haptic?: HapticKind | false;
  /** Layout of the touch target, for example a margin. */
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

const DIAMETER = { sm: 36, md: sizes.skip, lg: sizes.play } as const;
const GLYPH = { sm: 17, md: 20, lg: 24 } as const;

/**
 * A round icon control: skip, replay, close, back.
 *
 *   <IconButton icon="play-skip-forward" accessibilityLabel="Skip this cue" onPress={skip} />
 *   <IconButton icon="close" variant="ghost" size="sm" accessibilityLabel="Close" />
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
  const filled = variant === 'accent' || selected;

  let fill: ViewStyle = styles.surface;
  let pressed: ViewStyle = styles.surfacePressed;
  if (filled) {
    fill = styles.ink;
    pressed = styles.inkPressed;
  } else if (variant === 'ghost') {
    fill = styles.ghost;
    pressed = styles.surface;
  }

  return (
    <PressableScale
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected }}
      containerStyle={style}
      disabled={disabled}
      haptic={haptic}
      // The 36 pt size still gets a 44 pt touch target.
      hitSlop={size === 'sm' ? 4 : 0}
      onPress={onPress}
      pressedStyle={pressed}
      scaleTo={0.94}
      style={[
        styles.button,
        { width: diameter, height: diameter, borderRadius: diameter / 2 },
        fill,
      ]}
      testID={testID}>
      <Icon color={filled ? colors.paper : colors.ink} name={icon} size={GLYPH[size]} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  surface: {
    backgroundColor: colors.paperSunk,
  },
  surfacePressed: {
    backgroundColor: colors.paperPressed,
  },
  ghost: {
    backgroundColor: colors.transparent,
  },
  ink: {
    backgroundColor: colors.ink,
  },
  inkPressed: {
    backgroundColor: colors.inkSoft,
  },
});
