import { StyleSheet, View } from 'react-native';

import { AppText, Icon, Surface, type IconName } from '@/components/ui';
import { WEATHER_META, capitalise, formatCadence, formatWeather } from '@/components/now/format';
import type { LiveReadings, PermissionState } from '@/lib/score';
import { space } from '@/theme';

type Props = {
  live: LiveReadings;
  permissions: { motion: PermissionState; location: PermissionState };
};

function Reading({ icon, label, value, testID }: { icon: IconName; label: string; value: string; testID: string }) {
  return (
    <View style={styles.cell}>
      <View style={styles.cellLabel}>
        <Icon name={icon} size={14} tone="tertiary" />
        <AppText numberOfLines={1} variant="overline">
          {label}
        </AppText>
      </View>
      <AppText numberOfLines={1} testID={testID} variant="title">
        {value}
      </AppText>
    </View>
  );
}

/** What the phone's sensors report right now, shown in live mode in place of the sliders' values. */
export function LiveReadingsCard({ live, permissions }: Props) {
  const weatherKnown = live.weather !== 'any';
  const denied: string[] = [];
  if (permissions.motion === 'denied') denied.push('motion');
  if (permissions.location === 'denied') denied.push('location');

  return (
    <Surface style={styles.card} testID="sim-live-readings">
      <View style={styles.row}>
        <Reading
          icon="walk-outline"
          label="Cadence"
          testID="sim-live-cadence"
          value={formatCadence(live.cadenceSpm)}
        />
        <Reading
          icon="speedometer-outline"
          label="Speed"
          testID="sim-live-speed"
          value={live.speedMps === null ? 'No GPS fix' : `${live.speedMps.toFixed(1)} m/s`}
        />
      </View>
      <View style={styles.row}>
        <Reading
          icon={weatherKnown ? WEATHER_META[live.weather].icon : 'cloud-outline'}
          label="Weather"
          testID="sim-live-weather"
          value={weatherKnown ? formatWeather(live.weather, live.temperatureC) : 'Not known yet'}
        />
        <Reading
          icon="location-outline"
          label="Place"
          testID="sim-live-place"
          value={live.placeName ?? 'Not known yet'}
        />
      </View>
      {denied.length > 0 ? (
        <AppText tone="accent" variant="caption">
          {capitalise(denied.join(' and '))} access {denied.length > 1 ? 'are' : 'is'} off, so some
          readings stay empty. Turn {denied.length > 1 ? 'them' : 'it'} on in Settings.
        </AppText>
      ) : null}
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space.lg,
  },
  row: {
    flexDirection: 'row',
    gap: space.lg,
  },
  cell: {
    flex: 1,
    gap: space.xs,
  },
  cellLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
});
