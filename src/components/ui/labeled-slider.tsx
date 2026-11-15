import Slider from '@react-native-community/slider';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, space, tones, type Tone } from '@/theme';

import { AppText } from './app-text';
import { Icon, type IconName } from './icon';

export type LabeledSliderProps = {
  /** "Cadence", "Hour". Shown in sentence case. */
  label: string;
  value: number;
  /** Called continuously while dragging. */
  onValueChange: (value: number) => void;
  /** Called once when the thumb is released. Send the context to the backend here, not while dragging. */
  onSlidingComplete?: (value: number) => void;
  /** @default 0 */
  minimumValue?: number;
  /** @default 1 */
  maximumValue?: number;
  /** Snap increment. @default 0 (continuous) */
  step?: number;
  /** Turns the number into the text shown at the right: `(v) => `${v} spm``. Defaults to a rounded number. */
  formatValue?: (value: number) => string;
  /** Captions under the ends of the track: "Still", "Sprint". */
  minimumLabel?: string;
  maximumLabel?: string;
  icon?: IconName;
  /** Colour of the filled part of the track: pass the song's album ink. Defaults to ink. */
  tint?: string;
  /** A tone, when there is no album ink. @default 'neutral' */
  tone?: Tone;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * A slider with its name on the left and its current value, in Fraunces, on
 * the right. For the Scene tab's cadence and hour controls.
 *
 *   <LabeledSlider
 *     label="Cadence"
 *     icon="walk-outline"
 *     value={cadence}
 *     onValueChange={setCadence}
 *     minimumValue={0}
 *     maximumValue={200}
 *     step={1}
 *     formatValue={(v) => (v === 0 ? 'Still' : `${v} spm`)}
 *     minimumLabel="Still"
 *     maximumLabel="Sprint"
 *   />
 *
 * The native slider is not a controlled component: it tracks the finger by
 * itself and `value` only positions the thumb when it changes from outside.
 */
export function LabeledSlider({
  label,
  value,
  onValueChange,
  onSlidingComplete,
  minimumValue = 0,
  maximumValue = 1,
  step = 0,
  formatValue,
  minimumLabel,
  maximumLabel,
  icon,
  tint,
  tone = 'neutral',
  disabled = false,
  style,
  testID,
}: LabeledSliderProps) {
  const shown = formatValue ? formatValue(value) : String(Math.round(value));

  return (
    <View style={[styles.root, disabled ? styles.disabled : null, style]}>
      <View style={styles.header}>
        <View style={styles.label}>
          {icon ? <Icon name={icon} size={15} tone="muted" /> : null}
          <AppText numberOfLines={1} variant="meta">
            {label}
          </AppText>
        </View>
        <AppText numberOfLines={1} variant="displaySmall">
          {shown}
        </AppText>
      </View>
      <Slider
        accessibilityLabel={`${label}, ${shown}`}
        disabled={disabled}
        maximumTrackTintColor={colors.hairline}
        maximumValue={maximumValue}
        minimumTrackTintColor={tint ?? tones[tone].solid}
        minimumValue={minimumValue}
        onSlidingComplete={onSlidingComplete}
        onValueChange={onValueChange}
        step={step}
        style={styles.slider}
        tapToSeek
        testID={testID}
        // iOS keeps its native white knob; elsewhere the thumb is ink.
        thumbTintColor={Platform.OS === 'ios' ? undefined : colors.ink}
        value={value}
      />
      {minimumLabel || maximumLabel ? (
        <View style={styles.ends}>
          <AppText variant="meta">{minimumLabel}</AppText>
          <AppText variant="meta">{maximumLabel}</AppText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignSelf: 'stretch',
  },
  disabled: {
    opacity: 0.4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: space.md,
  },
  label: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
    paddingBottom: space.xs,
  },
  slider: {
    height: 40,
    // Android's SeekBar pads its track on both sides; pull it back to the text margin.
    marginHorizontal: Platform.OS === 'android' ? -12 : 0,
  },
  ends: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -space.xs,
  },
});
