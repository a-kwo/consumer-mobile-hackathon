import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { CUE_TEXT_INSET, CueRow, type CueRowState } from '@/components/ost/cue-row';
import {
  addDays,
  cueCount,
  cueNumber,
  dayKey,
  formatLongDate,
  mosaicCovers,
  relativeDayLabel,
  startOfLocalDay,
  toReplayItems,
} from '@/components/ost/format';
import { useOst } from '@/components/ost/queries';
import { TracklistSkeleton } from '@/components/ost/tracklist-skeleton';
import { useMinuteClock } from '@/components/ost/use-clock';
import { TabBarProbe, useReplayBarListInset } from '@/components/replay';
import {
  AppText,
  CoverMosaic,
  Divider,
  EmptyState,
  IconButton,
  LiveBadge,
  Screen,
  SectionHeader,
  useScreenInsets,
} from '@/components/ui';
import { useProfile, useReplay, useSession, type OstEntry } from '@/lib/score';
import { layout, space } from '@/theme';

const NO_ENTRIES: OstEntry[] = [];

/** The Soundtrack tab: one day as an album, with its cues as the tracklist. */
export default function SoundtrackScreen() {
  const { deviceId } = useProfile();
  const replay = useReplay();
  const session = useSession();
  const insets = useScreenInsets();
  const replayInset = useReplayBarListInset();

  // 0 is today, -1 yesterday, and so on. Never positive.
  const [dayOffset, setDayOffset] = useState(0);
  const today = startOfLocalDay(useMinuteClock());
  const dayStart = addDays(today, dayOffset);
  const dayEnd = addDays(dayStart, 1);
  const isToday = dayOffset === 0;

  const ost = useOst(deviceId, dayStart, dayEnd);
  const loading = ost === undefined;
  const entries = ost?.entries ?? NO_ENTRIES;
  const covers = mosaicCovers(entries);
  const listId = `ost:${dayKey(dayStart)}`;
  const replayingHere = replay.listId === listId;
  const scoringLive = isToday && session.status !== 'idle';

  const onRowPress = (index: number) => {
    if (replayingHere && replay.index === index) {
      replay.stop();
    } else {
      replay.play(listId, toReplayItems(entries), index);
    }
  };

  const rowState = (index: number): CueRowState => {
    if (!replayingHere || replay.index !== index) return 'idle';
    return replay.status === 'loading' ? 'loading' : 'playing';
  };

  let statusLine = 'Gathering the day’s cues…';
  if (!loading) {
    if (entries.length === 0) statusLine = isToday ? 'No cues yet today' : 'No cues this day';
    else statusLine = ost.summary ? `${cueCount(entries.length)} · ${ost.summary}` : cueCount(entries.length);
  }

  const header = (
    <View style={styles.header}>
      <View style={styles.topBar}>
        <View style={styles.topBarText}>
          <AppText numberOfLines={1} variant="overline">
            Original soundtrack
          </AppText>
          {scoringLive ? <LiveBadge label="Scoring live" outlined={false} /> : null}
        </View>
        <IconButton
          accessibilityLabel="Share this soundtrack"
          disabled={entries.length === 0}
          icon="share-outline"
          onPress={() => router.push({ pathname: '/share', params: { day: String(dayStart) } })}
          testID="ost-share"
        />
      </View>

      <CoverMosaic
        accessibilityLabel={`Cover of the soundtrack for ${formatLongDate(dayStart)}`}
        shadow
        size={176}
        style={styles.mosaic}
        uris={covers}
      />

      <View style={styles.dayRow}>
        <IconButton
          accessibilityLabel="Previous day"
          icon="chevron-back"
          onPress={() => setDayOffset(dayOffset - 1)}
          size="sm"
          testID="ost-prev-day"
          variant="ghost"
        />
        <View style={styles.dayText}>
          <AppText align="center" tone={isToday ? 'accent' : 'tertiary'} variant="overline">
            {relativeDayLabel(dayStart, today)}
          </AppText>
          <AppText
            accessibilityRole="header"
            adjustsFontSizeToFit
            align="center"
            minimumFontScale={0.7}
            numberOfLines={2}
            testID="ost-date"
            variant="displayMedium">
            {formatLongDate(dayStart)}
          </AppText>
        </View>
        <IconButton
          accessibilityLabel="Next day"
          disabled={isToday}
          icon="chevron-forward"
          onPress={() => setDayOffset(Math.min(0, dayOffset + 1))}
          size="sm"
          testID="ost-next-day"
          variant="ghost"
        />
      </View>

      <AppText align="center" style={styles.status} testID="ost-summary" tone="secondary">
        {statusLine}
      </AppText>

      {entries.length > 0 ? (
        <SectionHeader detail={cueNumber(entries.length - 1)} style={styles.section} title="Cues" />
      ) : null}
    </View>
  );

  let empty = null;
  if (loading) {
    empty = <TracklistSkeleton testID="ost-loading" />;
  } else if (isToday) {
    empty = (
      <EmptyState
        actionIcon="play"
        actionLabel="Go to Now"
        fill={false}
        icon="musical-notes-outline"
        message="Start scoring on the Now tab and each cue will land here with a title of its own."
        onAction={() => router.navigate('/')}
        testID="ost-empty"
        title="Nothing scored yet"
      />
    );
  } else {
    empty = (
      <EmptyState
        actionIcon="today-outline"
        actionLabel="Back to today"
        fill={false}
        icon="moon-outline"
        message="No cues were logged on this day."
        onAction={() => setDayOffset(0)}
        testID="ost-empty"
        title="A quiet day"
      />
    );
  }

  return (
    <TabBarProbe>
      <Screen coverUrl={covers[0]} edges="none" padded={false} testID="ost-screen">
        <FlatList
          ItemSeparatorComponent={CueDivider}
          ListEmptyComponent={empty}
          ListHeaderComponent={header}
          contentContainerStyle={{
            paddingTop: insets.top + space.md,
            paddingBottom:
              insets.bottom + layout.tabBarClearance + layout.scrollEndPadding + replayInset,
            paddingHorizontal: layout.screenPadding,
          }}
          contentInsetAdjustmentBehavior="never"
          data={entries}
          keyExtractor={(entry) => entry.playId}
          // New cues are appended, so the offset holds on its own; this also
          // holds it if the oldest cue ever drops off the top of a long day.
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
          renderItem={({ item, index }) => (
            <CueRow
              entry={item}
              index={index}
              onPress={onRowPress}
              state={rowState(index)}
              testID={`ost-row-${index + 1}`}
            />
          )}
          showsVerticalScrollIndicator={false}
          testID="ost-list"
        />
      </Screen>
    </TabBarProbe>
  );
}

function CueDivider() {
  return <Divider inset={CUE_TEXT_INSET} />;
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'stretch',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: layout.minTouch,
  },
  topBarText: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  mosaic: {
    alignSelf: 'center',
    marginTop: space.lg,
  },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.xl,
  },
  dayText: {
    flex: 1,
    gap: space.xs,
  },
  status: {
    marginTop: space.sm,
    paddingHorizontal: space.lg,
  },
  section: {
    marginTop: space.xl,
    marginBottom: space.xs,
  },
});
