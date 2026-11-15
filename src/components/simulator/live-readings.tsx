import { StyleSheet, View } from 'react-native';

import { AppText, Divider, Surface } from '@/components/ui';
import { capitalise, formatCadence, formatWeather } from '@/components/now/format';
import type { LiveReadings, PermissionState } from '@/lib/score';
import { space } from '@/theme';

type Props = {
  live: LiveReadings;
  permissions: { motion: PermissionState; location: PermissionState };
};

function Reading({ label, value, testID }: { label: string; value: string; testID: string }) {
  return (
    <View style={styles.row}>
      <AppText tone="muted" variant="body">
        {label}
      </AppText>
      <AppText align="right" numberOfLines={1} style={styles.value} testID={testID} variant="body">
        {value}
      </AppText>
    </View>
  );
}

/** What the phone reports right now, shown in automatic mode: a short list, one reading a line. */
export function LiveReadingsCard({ live, permissions }: Props) {
  const weatherKnown = live.weather !== 'any';
  const denied: string[] = [];
  if (permissions.motion === 'denied') denied.push('motion');
  if (permissions.location === 'denied') denied.push('location');

  return (
    <Surface padding="none" style={styles.card} testID="sim-live-readings">
      <Reading label="Pace" testID="sim-live-cadence" value={formatCadence(live.cadenceSpm)} />
      <Divider />
      <Reading
        label="Speed"
        testID="sim-live-speed"
        value={live.speedMps === null ? 'No GPS fix yet' : `${live.speedMps.toFixed(1)} m/s`}
      />
      <Divider />
      <Reading
        label="Weather"
        testID="sim-live-weather"
        value={weatherKnown ? formatWeather(live.weather, live.temperatureC) : 'Not known yet'}
      />
      <Divider />
      <Reading label="Place" testID="sim-live-place" value={live.placeName ?? 'Not known yet'} />
      {denied.length > 0 ? (
        <AppText style={styles.note} tone="soft" variant="meta">
          {capitalise(denied.join(' and '))} access {denied.length > 1 ? 'are' : 'is'} off, so some
          readings stay empty. Turn {denied.length > 1 ? 'them' : 'it'} on in Settings.
        </AppText>
      ) : null}
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: space.lg,
    paddingVertical: space.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.lg,
    minHeight: 44,
  },
  value: {
    flex: 1,
  },
  note: {
    paddingVertical: space.md,
  },
});
