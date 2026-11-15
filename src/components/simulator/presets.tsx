import { StyleSheet, View } from 'react-native';

import { PillButton, type IconName } from '@/components/ui';
import type { SimValues } from '@/lib/score';
import { space } from '@/theme';

export type Preset = { label: string; icon: IconName; values: SimValues };

/** One-tap moments. Each sets all four scene values (pace, hour, weather, setting). */
export const PRESETS: readonly Preset[] = [
  {
    label: 'Rainy night walk',
    icon: 'rainy-outline',
    values: { cadenceSpm: 95, localHour: 23, weather: 'rain', setting: 'city' },
  },
  {
    label: 'Sunrise run',
    icon: 'sunny-outline',
    values: { cadenceSpm: 165, localHour: 6.5, weather: 'clear', setting: 'nature' },
  },
  {
    label: 'Gym',
    icon: 'barbell-outline',
    values: { cadenceSpm: 150, localHour: 18, weather: 'any', setting: 'gym' },
  },
  {
    label: 'Sunday morning',
    icon: 'cafe-outline',
    values: { cadenceSpm: 0, localHour: 9.5, weather: 'clear', setting: 'indoors' },
  },
  {
    label: 'Commute',
    icon: 'train-outline',
    values: { cadenceSpm: 0, localHour: 8, weather: 'cloudy', setting: 'transit' },
  },
  {
    label: 'Snow day stroll',
    icon: 'snow-outline',
    values: { cadenceSpm: 70, localHour: 15, weather: 'snow', setting: 'nature' },
  },
];

function matches(a: SimValues, b: SimValues): boolean {
  return (
    a.cadenceSpm === b.cadenceSpm &&
    a.localHour === b.localHour &&
    a.weather === b.weather &&
    a.setting === b.setting
  );
}

type Props = {
  /** The hand-set scene values, or null when they are not in use (automatic mode). */
  current: SimValues | null;
  onSelect: (values: SimValues) => void;
};

/** The moments as a two-column grid. testIDs are `sim-preset-1` to `sim-preset-6`. */
export function PresetGrid({ current, onSelect }: Props) {
  return (
    <View style={styles.grid}>
      {PRESETS.map((preset, index) => {
        const selected = current !== null && matches(current, preset.values);
        return (
          <View key={preset.label} style={styles.cell}>
            <PillButton
              accessibilityLabel={`Moment: ${preset.label}`}
              grow
              haptic="select"
              icon={preset.icon}
              label={preset.label}
              onPress={() => onSelect(preset.values)}
              size="sm"
              testID={`sim-preset-${index + 1}`}
              tone={selected ? 'accent' : 'neutral'}
            />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -space.xs,
    rowGap: space.sm,
  },
  cell: {
    width: '50%',
    paddingHorizontal: space.xs,
    flexDirection: 'row',
  },
});
