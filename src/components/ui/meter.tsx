import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { motion, space, type Tone } from '@/theme';

import { AppText } from './app-text';
import { ProgressBar } from './progress-bar';

export type MeterProps = {
  /** "Energy", "Mood". Shown in sentence case. */
  label: string;
  /** Level from 0 to 1. */
  value: number;
  /** Fill colour: pass the song's album ink. Defaults to ink. */
  tint?: string;
  /** A tone, when there is no album ink. @default 'neutral' */
  tone?: Tone;
  /** Text shown at the right. Defaults to the value as a whole number out of 100. */
  valueLabel?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * A labelled level from 0 to 1. Use it sparingly, and never as a grid of
 * statistics: the identity prefers a sentence to a dashboard.
 *
 *   <Meter label="Energy" value={scene.energy} />
 */
export function Meter({ label, value, tint, tone = 'neutral', valueLabel, style }: MeterProps) {
  const clamped = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  const shown = valueLabel ?? String(Math.round(clamped * 100));

  return (
    <View
      accessibilityLabel={`${label}: ${shown}`}
      accessibilityRole="text"
      accessible
      style={[styles.meter, style]}>
      <View style={styles.header}>
        <AppText numberOfLines={1} style={styles.label} variant="meta">
          {label}
        </AppText>
        <AppText numberOfLines={1} tone="primary" variant="time">
          {shown}
        </AppText>
      </View>
      <ProgressBar tint={tint} tone={tone} transitionMs={motion.duration.slow} value={clamped} />
    </View>
  );
}

const styles = StyleSheet.create({
  meter: {
    gap: space.sm - 2,
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
