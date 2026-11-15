import { StyleSheet, View } from 'react-native';

import { AppText, Notice, PillButton, Surface } from '@/components/ui';
import { OCCASION_META, capitalise } from '@/components/now/format';
import type { Occasion, SensingApi } from '@/lib/score';
import { space } from '@/theme';

import { OCCASIONS } from '../../../convex/lib/validators';
import { OptionChips, type Option } from './option-chips';

type OccasionChoice = Occasion | 'none';

const OCCASION_OPTIONS: readonly Option<OccasionChoice>[] = [
  { value: 'none', label: 'None', icon: 'ellipse-outline' },
  ...OCCASIONS.map((value) => ({ value, ...OCCASION_META[value] })),
];

/** Minutes until the chosen event starts. Zero is an event that is underway. */
const MINUTE_OPTIONS: readonly Option<string>[] = [
  { value: '60', label: '60 min' },
  { value: '45', label: '45 min' },
  { value: '30', label: '30 min' },
  { value: '10', label: '10 min' },
  { value: '0', label: 'Now' },
];

function calendarLine(sensing: SensingApi): string {
  if (!sensing.calendarEnabled) return 'Calendar is off';
  return sensing.scene.occasionLine ?? 'Nothing recognised in the next hour';
}

/**
 * The engine's notices are written in its own vocabulary, where choosing an
 * event by hand is "simulated". On screen that mode is called Manual.
 */
function noticeText(notice: string): string {
  return notice.replace('Simulated events still work.', 'Events chosen in Manual still work.');
}

type Props = {
  sensing: SensingApi;
};

/**
 * The event the score is building towards. In manual mode it is chosen here
 * (what kind, how far off) and the calendar is never read; in automatic mode
 * it comes from the device calendar, once the user has switched that on.
 * (The engine calls these modes 'simulated' and 'live'.)
 */
export function UpcomingEvent({ sensing }: Props) {
  const { mode, sim, setSim, calendarEnabled, setCalendarEnabled, occasionNotice } = sensing;
  const isLive = mode === 'live';

  return (
    <View style={styles.root}>
      {isLive ? (
        <Surface style={styles.card} testID="sim-calendar-status">
          <AppText numberOfLines={2} testID="sim-calendar-line" variant="body">
            {capitalise(calendarLine(sensing))}
          </AppText>
          <AppText tone="muted" variant="meta">
            Only the kind of event and the minutes until it starts leave this phone, never its
            title.
          </AppText>
        </Surface>
      ) : (
        <>
          <OptionChips<OccasionChoice>
            accessibilityLabel="Upcoming event"
            onChange={(value) => setSim({ occasion: value === 'none' ? null : value })}
            options={OCCASION_OPTIONS}
            testIDPrefix="sim-occasion"
            value={sim.occasion ?? 'none'}
          />
          <OptionChips
            accessibilityLabel="Event starts in"
            disabled={!sim.occasion}
            onChange={(value) => setSim({ minutesUntil: Number(value) })}
            options={MINUTE_OPTIONS}
            testIDPrefix="sim-event-minutes"
            value={sim.occasion ? String(sim.minutesUntil) : null}
          />
        </>
      )}
      <View style={styles.calendar}>
        <PillButton
          accessibilityLabel={calendarEnabled ? 'Stop reading my calendar' : 'Read my calendar'}
          haptic="select"
          icon={calendarEnabled ? 'checkmark' : 'calendar-outline'}
          label={calendarEnabled ? 'Calendar on' : 'Use my calendar'}
          onPress={() => setCalendarEnabled(!calendarEnabled)}
          size="sm"
          testID="sim-calendar-toggle"
        />
        {isLive ? null : (
          <AppText style={styles.calendarNote} tone="muted" variant="meta">
            Your calendar is read in Automatic. In Manual, the event chosen here is used.
          </AppText>
        )}
      </View>
      {occasionNotice ? (
        <Notice message={noticeText(occasionNotice)} testID="sim-event-notice" tone="warning" />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: space.md,
  },
  card: {
    gap: space.xs,
  },
  calendar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  calendarNote: {
    flex: 1,
  },
});
