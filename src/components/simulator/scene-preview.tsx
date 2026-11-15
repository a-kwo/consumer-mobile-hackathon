import { StyleSheet, View } from 'react-native';

import { AppText, Chip, Meter, Surface } from '@/components/ui';
import { capitalise, nudgeLine } from '@/components/now/format';
import type { Scene, SensingMode } from '@/lib/score';
import { space } from '@/theme';

type Props = {
  /** `useSensing().scene`: what a pick would target right now. */
  scene: Scene;
  mode: SensingMode;
  energyBias: number;
  nudgePicksLeft: number;
};

/**
 * The scene a cue would be picked for right now, as a title card with its
 * targets. It follows the sliders (or the sensors) as they move.
 */
export function ScenePreview({ scene, mode, energyBias, nudgePicksLeft }: Props) {
  const nudge = nudgeLine(energyBias, nudgePicksLeft);

  return (
    <Surface style={styles.card} variant="raised">
      <AppText variant="overline">
        {mode === 'live' ? 'Your scene right now' : 'The scene you set'}
      </AppText>
      <View style={styles.label}>
        <AppText
          accessibilityRole="header"
          adjustsFontSizeToFit
          minimumFontScale={0.85}
          numberOfLines={2}
          testID="sim-scene-label"
          variant="displaySmall">
          {capitalise(scene.label)}
        </AppText>
      </View>
      <View style={styles.meters}>
        <Meter label="Energy" style={styles.meter} tone="energy" value={scene.energy} />
        <Meter label="Valence" style={styles.meter} tone="calm" value={scene.valence} />
      </View>
      <View style={styles.chips}>
        {scene.bpm !== null ? (
          <Chip icon="pulse-outline" label={`Target ${scene.bpm} BPM`} size="sm" tone="accent" />
        ) : (
          <Chip icon="pulse-outline" label="No tempo lock" size="sm" />
        )}
        {nudge ? (
          <Chip
            icon={energyBias < 0 ? 'moon-outline' : 'flash-outline'}
            label={nudge}
            size="sm"
            tone={energyBias < 0 ? 'calm' : 'energy'}
          />
        ) : null}
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space.md,
  },
  label: {
    height: 56,
    justifyContent: 'center',
  },
  meters: {
    flexDirection: 'row',
    gap: space.xl,
  },
  meter: {
    flex: 1,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
});
