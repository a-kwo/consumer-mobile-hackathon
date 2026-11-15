import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import type { SensingMode } from '@/lib/score';
import { space } from '@/theme';

import { ModeBadge } from './mode-badge';

/** The top row of the Now screen: the wordmark, and where the scene comes from. */
export function NowHeader({ mode }: { mode: SensingMode }) {
  return (
    <View style={styles.row}>
      <AppText accessibilityRole="header" variant="wordmark">
        Score
      </AppText>
      <ModeBadge mode={mode} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: space.md,
    height: 28,
    // The figure's box reaches a little above the stage and ends in opaque
    // paper; the header stays on top of it.
    zIndex: 1,
  },
});
