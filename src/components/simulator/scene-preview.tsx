import { StyleSheet, View } from 'react-native';

import { AppText, Meter, Surface } from '@/components/ui';
import { nudgeLine, sceneSentence } from '@/components/now/format';
import type { Scene, SensingMode } from '@/lib/score';
import { fonts, space } from '@/theme';

type Props = {
  /** `useSensing().scene`: what a pick would target right now. */
  scene: Scene;
  mode: SensingMode;
  energyBias: number;
  nudgePicksLeft: number;
  /** Album ink of the playing song, for the meters. Defaults to ink. */
  tint?: string;
};

/**
 * The scene a cue would be picked for right now, as a sentence, with what the
 * music will aim for. It follows the controls (or the phone) as they move.
 */
export function ScenePreview({ scene, mode, energyBias, nudgePicksLeft, tint }: Props) {
  const nudge = nudgeLine(energyBias, nudgePicksLeft);
  const tempo = scene.bpm !== null ? `Tempo in step at ${scene.bpm} BPM` : 'No tempo lock while still';

  return (
    <Surface style={styles.card}>
      <AppText tone="muted" variant="meta">
        {mode === 'live' ? 'Your scene right now' : 'The scene you set'}
      </AppText>
      <View style={styles.sentence}>
        <AppText
          accessibilityRole="header"
          adjustsFontSizeToFit
          minimumFontScale={0.85}
          numberOfLines={2}
          style={styles.sentenceText}
          testID="sim-scene-label">
          {sceneSentence(scene)}
        </AppText>
      </View>
      <View style={styles.meters}>
        <Meter label="Energy" style={styles.meter} tint={tint} value={scene.energy} />
        <Meter label="Mood" style={styles.meter} tint={tint} value={scene.valence} />
      </View>
      <AppText numberOfLines={2} tone="muted" variant="meta">
        {nudge ? `${tempo} · ${nudge}` : tempo}
      </AppText>
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space.md,
  },
  // Two lines of the sentence, whether or not it needs both.
  sentence: {
    height: 56,
    justifyContent: 'center',
  },
  sentenceText: {
    fontFamily: fonts.serifItalic,
    fontSize: 22,
    lineHeight: 28,
  },
  meters: {
    flexDirection: 'row',
    gap: space.xl,
  },
  meter: {
    flex: 1,
  },
});
