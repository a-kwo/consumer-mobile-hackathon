import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, layout, space } from '@/theme';

import { AppText } from './app-text';

export type SectionHeaderProps = {
  /** Shown as a film-credits label: upper case, letter-spaced. */
  title: string;
  /** A short value after the title, in the same style: a count, a time ("07", "6:12 PM"). */
  detail?: string;
  /** Anything to pin to the right edge: a `PillButton`, an `IconButton`. */
  trailing?: ReactNode;
  /** Draw the hairline that runs from the title to the right edge. @default true */
  rule?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * The heading of a section, set like a credit: a small label, a hairline that
 * runs to the edge, and an optional detail or control at the end.
 *
 *   <SectionHeader title="Today's cues" detail="07" />
 *   <SectionHeader title="Scene" trailing={<PillButton size="sm" label="Reset" />} />
 */
export function SectionHeader({ title, detail, trailing, rule = true, style }: SectionHeaderProps) {
  return (
    <View accessibilityRole="header" style={[styles.header, style]}>
      <AppText numberOfLines={1} style={styles.title} variant="overline">
        {title}
      </AppText>
      {rule ? <View style={styles.rule} /> : <View style={styles.spacer} />}
      {detail ? (
        <AppText numberOfLines={1} style={styles.detail} variant="overline">
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
    minHeight: 24,
  },
  // The title keeps its full width; a long detail is the one that truncates.
  title: {
    flexShrink: 0,
    maxWidth: '70%',
  },
  detail: {
    flexShrink: 1,
  },
  rule: {
    flex: 1,
    minWidth: space.lg,
    height: layout.hairline,
    backgroundColor: colors.hairlineStrong,
  },
  spacer: {
    flex: 1,
  },
});
