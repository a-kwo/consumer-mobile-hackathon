import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, layout, space } from '@/theme';

import { AppText } from './app-text';

export type SectionHeaderProps = {
  /** Shown as written, in sentence case. */
  title: string;
  /** A short value at the right, in muted meta text: a count, a time. */
  detail?: string;
  /** Anything to pin to the right edge: a small button. */
  trailing?: ReactNode;
  /** Draw a hairline under the heading. @default false */
  rule?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * The heading of a section: a plain label in ink, with an optional detail or
 * control at the right.
 *
 *   <SectionHeader title="Today's cues" detail="7 songs" />
 */
export function SectionHeader({
  title,
  detail,
  trailing,
  rule = false,
  style,
}: SectionHeaderProps) {
  return (
    <View accessibilityRole="header" style={[styles.header, rule ? styles.ruled : null, style]}>
      <AppText numberOfLines={1} style={styles.title} variant="title">
        {title}
      </AppText>
      {detail ? (
        <AppText numberOfLines={1} style={styles.detail} variant="meta">
          {detail}
        </AppText>
      ) : null}
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 28,
  },
  ruled: {
    paddingBottom: space.sm,
    borderBottomWidth: layout.hairline,
    borderBottomColor: colors.hairline,
  },
  title: {
    flex: 1,
  },
  detail: {
    flexShrink: 1,
  },
});
