import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, layout, radius, space, tones, type Tone } from '@/theme';

import { AppText } from './app-text';
import { Icon, type IconName } from './icon';

export type ChipProps = {
  label: string;
  icon?: IconName;
  /** @default 'neutral' */
  tone?: Tone;
  /** `sm` is 24 pt tall, `md` is 30 pt. @default 'md' */
  size?: 'sm' | 'md';
  style?: StyleProp<ViewStyle>;
};

/**
 * A small read-only tag: an icon and a short value. Use it for the facts of
 * the moment (cadence, weather, tempo, a mood).
 *
 *   <Chip icon="walk-outline" label="112 spm" />
 *   <Chip icon="rainy-outline" label="Rain" tone="calm" />
 *
 * For a tappable choice use `ChoiceChips`; for an action use `PillButton`.
 */
export function Chip({ label, icon, tone = 'neutral', size = 'md', style }: ChipProps) {
  const palette = tones[tone];
  const small = size === 'sm';
  const foreground = tone === 'neutral' ? colors.text : palette.fg;

  return (
    <View style={[styles.wrap, style]}>
      <View
        style={[
          styles.chip,
          small ? styles.small : styles.medium,
          { backgroundColor: palette.bg, borderColor: palette.border },
        ]}>
        {icon ? (
          <Icon
            color={tone === 'neutral' ? colors.textSecondary : palette.fg}
            name={icon}
            size={small ? 12 : 14}
          />
        ) : null}
        <AppText
          numberOfLines={1}
          style={[styles.label, small ? styles.labelSmall : null, { color: foreground }]}
          variant="label">
          {label}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Hugs its content in a column and centres on the cross axis of a row.
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    borderRadius: radius.pill,
    borderWidth: layout.hairline,
  },
  medium: {
    height: 30,
    paddingHorizontal: space.md,
    gap: 6,
  },
  small: {
    height: 24,
    paddingHorizontal: space.sm + 2,
    gap: space.xs,
  },
  label: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '500',
    flexShrink: 1,
  },
  labelSmall: {
    fontSize: 12,
    lineHeight: 15,
  },
});
