import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors } from '@/theme';

export type AvatarProps = {
  /** A single emoji. Profiles in Score have an emoji, not a photo. */
  emoji: string;
  /** Diameter in points. @default 40 */
  size?: number;
  /** Draw an ink ring, for the friend whose soundtrack is playing. */
  ring?: boolean;
  /** The person's name, for screen readers. */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * A person: an emoji in a paperSunk circle.
 *
 *   <Avatar emoji="🎧" accessibilityLabel="Mina" />
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
    backgroundColor: colors.paperSunk,
  },
  ring: {
    borderWidth: 1.5,
    borderColor: colors.ink,
  },
  emoji: {
    textAlign: 'center',
    includeFontPadding: false,
    color: colors.ink,
  },
});
