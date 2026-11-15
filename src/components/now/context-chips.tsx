import { StyleSheet, View } from 'react-native';

import { Chip } from '@/components/ui';
import type { PlayContext, Scene } from '@/lib/score';
import { space } from '@/theme';

import { WEATHER_META, formatCadence, formatClock, formatWeather } from './format';

type Props = {
  /** The context right now: `useSensing().context`. */
  context: PlayContext;
  /** The scene of the playing song, which knows the weather the server resolved. */
  scene?: Scene | null;
};

/** The facts of the moment as one row of chips: cadence, weather, local time. */
export function ContextChips({ context, scene }: Props) {
  const weather = context.weather !== 'any' ? context.weather : (scene?.weather ?? 'any');
  const temperatureC = context.temperatureC ?? scene?.temperatureC ?? null;

  return (
    <View style={styles.row}>
      <Chip icon="walk-outline" label={formatCadence(context.cadenceSpm)} />
      {weather !== 'any' ? (
        <Chip icon={WEATHER_META[weather].icon} label={formatWeather(weather, temperatureC)} />
      ) : null}
      <Chip icon="time-outline" label={formatClock(context.localHour)} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: space.sm,
    overflow: 'hidden',
  },
});
