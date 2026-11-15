import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, space, tones, type Tone } from '@/theme';

import { AppText } from './app-text';
import { Icon, type IconName } from './icon';

export type ChipProps = {
  label: string;
  icon?: IconName;
  /** Only `danger` and `success` change the colour; the rest are ink on paperSunk. @default 'neutral' */
  tone?: Tone;
  /** `sm` is 24 pt tall, `md` is 30 pt. @default 'md' */
  size?: 'sm' | 'md';
  style?: StyleProp<ViewStyle>;
};

/**
 * A small read-only tag: a quiet filled rectangle with a short value. It is
 * not outlined and not a pill.
 *
 *   <Chip icon="walk-outline" label="112 steps/min" />
 *
 * Prefer words where you can: the identity tells weather and pace in a meta
 * line ("92 steps/min · Rain"), which is `<AppText variant="meta">`. For a
 * tappable choice use `ChoiceChips`; for an action use `PillButton`.
 */
export function Chip({ label, icon, tone = 'neutral', size = 'md', style }: ChipProps) {
  const palette = tones[tone];
  const small = size === 'sm';
  const hued = tone === 'danger' || tone === 'success';
  const foreground = hued ? palette.fg : colors.ink;

  return (
    <View style={[styles.wrap, style]}>
      <View
        style={[
          styles.chip,
          small ? styles.small : styles.medium,
          { backgroundColor: palette.bg },
        ]}>
        {icon ? (
          <Icon color={hued ? palette.fg : colors.inkMuted} name={icon} size={small ? 12 : 14} />
        ) : null}
        <AppText
          numberOfLines={1}
          style={[styles.label, small ? styles.labelSmall : null, { color: foreground }]}
          variant="meta">
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
    borderRadius: 8,
  },
  medium: {
    height: 30,
    paddingHorizontal: space.md - 2,
    gap: 6,
  },
  small: {
    height: 24,
    paddingHorizontal: space.sm,
    gap: space.xs,
    borderRadius: 6,
  },
  label: {
    lineHeight: 18,
    flexShrink: 1,
  },
  labelSmall: {
    fontSize: 12,
    lineHeight: 16,
  },
});
