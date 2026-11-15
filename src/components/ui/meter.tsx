import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { motion, space, type Tone } from '@/theme';

import { AppText } from './app-text';
import { ProgressBar } from './progress-bar';

export type MeterProps = {
  /** Shown as a film-credits label: "Energy", "Valence". */
  label: string;
  /** Level from 0 to 1. */
  value: number;
  /** `energy` (warm) and `calm` (cool) are the intended tones. @default 'accent' */
  tone?: Tone;
  /** Text shown at the right. Defaults to the value as a whole number out of 100. */
  valueLabel?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * A labelled level from 0 to 1, for the scene's target energy and valence.
 *
 *   <Meter label="Energy" value={scene.energy} tone="energy" />
 *   <Meter label="Valence" value={scene.valence} tone="calm" valueLabel="bright" />
 *
 * Meters share a row well: give each `style={{ flex: 1 }}`.
 */
export function Meter({ label, value, tone = 'accent', valueLabel, style }: MeterProps) {
  const clamped = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  const shown = valueLabel ?? String(Math.round(clamped * 100));

  return (
    <View
      accessibilityLabel={`${label}: ${shown}`}
      accessibilityRole="text"
      accessible
      style={[styles.meter, style]}>
      <View style={styles.header}>
        <AppText numberOfLines={1} style={styles.label} variant="overline">
          {label}
        </AppText>
        <AppText numberOfLines={1} tone="secondary" variant="numeric">
          {shown}
        </AppText>
      </View>
      <ProgressBar height={4} tone={tone} transitionMs={motion.duration.slow} value={clamped} />
    </View>
  );
}

const styles = StyleSheet.create({
  meter: {
    gap: space.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  label: {
    flexShrink: 1,
  },
});
