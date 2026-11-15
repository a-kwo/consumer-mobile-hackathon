import { ActivityIndicator, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, sizes, space } from '@/theme';

import { AppText } from './app-text';
import type { HapticKind } from './haptics';
import { Icon, type IconName } from './icon';
import { PressableScale } from './pressable-scale';

export type PrimaryButtonProps = {
  /** Omit the label for the round play and pause button. */
  label?: string;
  icon?: IconName;
  onPress?: () => void;
  /**
   * `accent` is ink with paper text: the one primary action. `surface` is
   * paperSunk with ink text, for the same control in a quieter state.
   * (The name `accent` is kept from the first kit; there is no accent colour.)
   * @default 'accent'
   */
  variant?: 'accent' | 'surface';
  /**
   * With a label: 44 high (`md`) or 48 high (`lg`). Round: a 48 (`md`) or
   * 60 (`lg`, the play button) circle. @default 'lg' when round, 'md' with a label
   */
  size?: 'md' | 'lg';
  /** Replace the icon with a spinner and ignore presses. */
  loading?: boolean;
  disabled?: boolean;
  /** Stretch to the width of the parent. Ignored for a round button. */
  fullWidth?: boolean;
  /** Required when there is no label. */
  accessibilityLabel?: string;
  /** @default 'press' */
  haptic?: HapticKind | false;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * The primary control. Without a label it is the play button: a 60 pt ink
 * circle with a paper icon. With a label it is the primary button: 44 high,
 * radius 14, ink fill, paper text. At most one per screen.
 *
 *   <PrimaryButton icon={playing ? 'pause' : 'play'} onPress={toggle}
 *     accessibilityLabel={playing ? 'Pause' : 'Play'} />
 *   <PrimaryButton label="Share" onPress={share} />
 */
export function PrimaryButton({
  label,
  icon,
  onPress,
  variant = 'accent',
  size,
  loading = false,
  disabled,
  fullWidth = false,
  accessibilityLabel,
  haptic = 'press',
  style,
  testID,
}: PrimaryButtonProps) {
  const round = !label;
  const large = (size ?? (round ? 'lg' : 'md')) === 'lg';
  const ink = variant === 'accent';
  const foreground = ink ? colors.paper : colors.ink;

  let shape: ViewStyle;
  if (round) {
    const diameter = large ? sizes.play : sizes.skip;
    shape = { width: diameter, height: diameter, borderRadius: diameter / 2 };
  } else {
    shape = {
      height: large ? sizes.control : sizes.primary,
      paddingHorizontal: large ? space.xl : space.lg + 2,
      borderRadius: radius.control,
    };
  }
  const glyphSize = round ? (large ? 24 : 20) : 17;

  return (
    <PressableScale
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ busy: loading }}
      containerStyle={[styles.container, fullWidth && !round ? styles.stretch : null, style]}
      disabled={disabled}
      fill={fullWidth && !round}
      // While loading the button keeps its full colour but does nothing.
      haptic={loading ? false : haptic}
      onPress={loading ? undefined : onPress}
      pressedStyle={ink ? styles.inkPressed : styles.surfacePressed}
      style={[styles.button, shape, ink ? styles.ink : styles.surface]}
      testID={testID}>
      {loading ? (
        <ActivityIndicator color={foreground} size="small" />
      ) : icon ? (
        <Icon
          color={foreground}
          name={icon}
          size={glyphSize}
          // The play triangle's visual centre sits left of its box.
          style={round && icon === 'play' ? { marginLeft: glyphSize * 0.12 } : undefined}
        />
      ) : null}
      {label ? (
        <AppText numberOfLines={1} style={{ color: foreground }} variant="button">
          {label}
        </AppText>
      ) : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  // Centred when the parent gives it a full row; a no-op inside a row of controls.
  container: {
    justifyContent: 'center',
  },
  stretch: {
    alignSelf: 'stretch',
  },
  ink: {
    backgroundColor: colors.ink,
  },
  inkPressed: {
    backgroundColor: colors.inkSoft,
  },
  surface: {
    backgroundColor: colors.paperSunk,
  },
  surfacePressed: {
    backgroundColor: colors.paperPressed,
  },
});
