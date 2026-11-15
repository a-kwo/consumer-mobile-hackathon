import { StyleSheet, View } from 'react-native';

import { Chip } from '@/components/ui';
import type { Scene } from '@/lib/score';

import { OCCASION_META } from './format';

type Props = {
  /** A scene from `buildScene` or from the server; it may carry no occasion. */
  scene: Scene | null | undefined;
  size?: 'sm' | 'md';
  testID: string;
};

/**
 * The occasion steering the score, as one amber chip: "Game in 45 min ·
 * building up". Renders nothing when the scene has none.
 */
export function OccasionChip({ scene, size = 'md', testID }: Props) {
  if (!scene?.occasion || !scene.occasionLine) return null;
  return (
    <View style={styles.row} testID={testID}>
      <Chip
        icon={OCCASION_META[scene.occasion]?.icon ?? 'calendar-outline'}
        label={scene.occasionLine}
        size={size}
        tone="accent"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
});
