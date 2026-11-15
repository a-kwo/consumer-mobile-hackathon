import { StyleSheet, View } from 'react-native';

import { colors, radius, space } from '@/theme';

import { CUE_COVER_SIZE } from './cue-row';

const WIDTHS = ['78%', '62%', '70%', '54%'] as const;

/** Placeholder rows shown while a tracklist loads. */
export function TracklistSkeleton({ rows = 4, testID }: { rows?: number; testID?: string }) {
  return (
    <View
      accessibilityLabel="Loading cues"
      accessibilityRole="progressbar"
      accessible
      style={styles.list}
      testID={testID}>
      {Array.from({ length: rows }, (_, index) => (
        <View key={index} style={styles.row}>
          <View style={styles.cover} />
          <View style={styles.text}>
            <View style={[styles.line, styles.titleLine, { width: WIDTHS[index % WIDTHS.length] }]} />
            <View style={[styles.line, { width: '44%' }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: space.xl,
    paddingVertical: space.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  cover: {
    width: CUE_COVER_SIZE,
    height: CUE_COVER_SIZE,
    borderRadius: radius.xs,
    backgroundColor: colors.surface,
  },
  text: {
    flex: 1,
    gap: space.sm,
  },
  line: {
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.surface,
  },
  titleLine: {
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.surfaceRaised,
  },
});
