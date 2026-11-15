import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, layout } from '@/theme';

export type AvatarProps = {
  /** A single emoji. Profiles in Score have an emoji, not a photo. */
  emoji: string;
  /** Diameter in points. @default 40 */
  size?: number;
  /** Draw an amber ring, for the friend whose soundtrack is playing. */
  ring?: boolean;
  /** The person's name, for screen readers. */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * A person: an emoji in a translucent circle.
 *
 *   <Avatar emoji="🎧" accessibilityLabel="Mina" />
 *   <Avatar emoji="🌧️" size={56} ring />
 */
export function Avatar({ emoji, size = 40, ring = false, accessibilityLabel, style }: AvatarProps) {
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
      accessible={!!accessibilityLabel}
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2 },
        ring ? styles.ring : null,
        style,
      ]}>
      <Text
        allowFontScaling={false}
        style={[styles.emoji, { fontSize: size * 0.5, lineHeight: size * 0.64 }]}>
        {emoji}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
    borderWidth: layout.hairline,
    borderColor: colors.hairlineStrong,
  },
  ring: {
    borderWidth: 1.5,
    borderColor: colors.accent,
  },
  emoji: {
    textAlign: 'center',
    includeFontPadding: false,
    color: colors.text,
  },
});
