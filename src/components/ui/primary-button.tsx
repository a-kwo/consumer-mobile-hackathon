import { ActivityIndicator, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { colors, layout, radius, shadows, space } from '@/theme';

import { AppText } from './app-text';
import type { HapticKind } from './haptics';
import { Icon, type IconName } from './icon';
import { PressableScale } from './pressable-scale';

export type PrimaryButtonProps = {
  /** Omit the label for a round, icon-only transport control. */
  label?: string;
  icon?: IconName;
  onPress?: () => void;
  /**
   * `accent` is the filled amber "go" state (start scoring). `surface` is the
   * quiet translucent state for the same control once running (stop).
   * @default 'accent'
   */
  variant?: 'accent' | 'surface';
  /** Height 48 (`md`) or 60 (`lg`). A round button is 60 or 76 across. @default 'lg' */
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
 * The one big control on a screen: start and stop. There should be at most
 * one `accent` PrimaryButton visible at a time.
 *
 *   <PrimaryButton label="Start scoring" icon="play" onPress={start} fullWidth />
 *   <PrimaryButton icon={playing ? 'stop' : 'play'} variant={playing ? 'surface' : 'accent'}
 *     accessibilityLabel={playing ? 'Stop' : 'Start'} onPress={toggle} />
 */
export function PrimaryButton({
  label,
  icon,
  onPress,
  variant = 'accent',
  size = 'lg',
  loading = false,
  disabled,
  fullWidth = false,
  accessibilityLabel,
  haptic = 'press',
  style,
  testID,
}: PrimaryButtonProps) {
  const round = !label;
  const large = size === 'lg';
  const accent = variant === 'accent';
  const foreground = accent ? colors.textOnAccent : colors.text;

  let dimensions: ViewStyle;
  if (round) {
    const diameter = large ? 76 : 60;
    dimensions = { width: diameter, height: diameter };
  } else {
    dimensions = {
      height: large ? 60 : 48,
      paddingHorizontal: large ? space.xxl : space.xl,
    };
  }
  const glyphSize = round ? (large ? 30 : 24) : large ? 22 : 20;

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
      pressedStyle={accent ? styles.accentPressed : styles.surfacePressed}
      style={[
        styles.button,
        dimensions,
        accent ? styles.accent : styles.surface,
        accent && !disabled ? shadows.accentGlow : null,
      ]}
      testID={testID}>
      {loading ? (
        <ActivityIndicator color={foreground} />
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
        <AppText
          numberOfLines={1}
          style={[styles.label, { color: foreground }, large ? null : styles.labelMedium]}
          variant="title">
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
    gap: space.sm + 2,
    borderRadius: radius.pill,
    borderWidth: layout.hairline,
  },
  // Centred when the parent gives it a full row; a no-op inside a row of controls.
  container: {
    justifyContent: 'center',
  },
  stretch: {
    alignSelf: 'stretch',
  },
  accent: {
    backgroundColor: colors.accent,
    borderColor: colors.accentBright,
  },
  accentPressed: {
    backgroundColor: colors.accentBright,
  },
  surface: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.hairlineStrong,
  },
  surfacePressed: {
    backgroundColor: colors.surfacePressed,
  },
  label: {
    letterSpacing: -0.1,
  },
  labelMedium: {
    fontSize: 16,
  },
});
