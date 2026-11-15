import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { CUE_TEXT_INSET, CueRow, type CueRowState } from '@/components/ost/cue-row';
import {
  addDays,
  dayKey,
  formatLongDate,
  mosaicCovers,
  relativeDayLabel,
  sentenceCase,
  startOfLocalDay,
  toReplayItems,
  trackCount,
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
  PrimaryButton,
  Screen,
  useScreenInsets,
} from '@/components/ui';
import { useProfile, useReplay, useSession, type OstEntry } from '@/lib/score';
import { layout, sizes, space } from '@/theme';

const NO_ENTRIES: OstEntry[] = [];

/** The Soundtrack tab: one day as a record, with its tracks listed like liner notes. */
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

  // The replay plays a snapshot of the list taken when it started, and the live
  // list can shift under it (the oldest track drops off), so the playing row is
  // matched on the item itself, never on its index.
  const isReplaying = (entry: OstEntry) =>
    replayingHere &&
    replay.item?.deezerId === entry.deezerId &&
    replay.item?.subtitle === entry.title;

  const onRowPress = (index: number) => {
    if (isReplaying(entries[index])) {
      replay.stop();
    } else {
      replay.play(listId, toReplayItems(entries), index);
    }
  };

  const rowState = (entry: OstEntry): CueRowState => {
    if (!isReplaying(entry)) return 'idle';
    return replay.status === 'loading' ? 'loading' : 'playing';
  };

  let statusLine = 'Gathering the day’s tracks…';
  if (!loading) {
    if (entries.length === 0) statusLine = isToday ? 'No tracks yet today' : 'No tracks this day';
    else {
      statusLine = ost.summary
        ? `${trackCount(entries.length)} · ${sentenceCase(ost.summary)}`
        : trackCount(entries.length);
    }
  }

  const header = (
    <View style={styles.header}>
      <View style={styles.topBar}>
        <AppText variant="wordmark">Score</AppText>
        <View style={styles.dayNav}>
          <IconButton
            accessibilityLabel="Previous day"
            icon="chevron-back"
            onPress={() => setDayOffset(dayOffset - 1)}
            size="sm"
            testID="ost-prev-day"
            variant="ghost"
          />
          <AppText numberOfLines={1} style={styles.dayLabel} testID="ost-date" variant="meta">
            {isToday ? formatLongDate(dayStart) : relativeDayLabel(dayStart, today)}
          </AppText>
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
      </View>

      <View style={styles.album}>
        <CoverMosaic
          accessibilityLabel={`Cover of the soundtrack for ${formatLongDate(dayStart)}`}
          size={sizes.soundtrackCover}
          uris={covers}
        />
        <View style={styles.albumText}>
          <AppText accessibilityRole="header" numberOfLines={3} variant="screenTitle">
            {isToday ? 'Today’s soundtrack' : formatLongDate(dayStart)}
          </AppText>
          <AppText testID="ost-summary" variant="meta">
            {statusLine}
          </AppText>
          {scoringLive ? <LiveBadge label="Scoring now" /> : null}
          <PrimaryButton
            accessibilityLabel="Share this soundtrack"
            disabled={entries.length === 0}
            label="Share"
            onPress={() => router.push({ pathname: '/share', params: { day: String(dayStart) } })}
            style={styles.share}
            testID="ost-share"
          />
        </View>
      </View>

      {entries.length > 0 ? <Divider style={styles.rule} /> : null}
    </View>
  );

  let empty = null;
  if (loading) {
    empty = <TracklistSkeleton testID="ost-loading" />;
  } else if (isToday) {
    empty = (
      <EmptyState
        actionLabel="Go to Now"
        fill={false}
        message="Start scoring on the Now tab and each track will land here with a title of its own."
        onAction={() => router.navigate('/')}
        testID="ost-empty"
        title="Nothing scored yet"
      />
    );
  } else {
    empty = (
      <EmptyState
        actionLabel="Back to today"
        fill={false}
        message="No tracks were logged on this day."
        onAction={() => setDayOffset(0)}
        testID="ost-empty"
        title="A quiet day"
      />
    );
  }

  return (
    <TabBarProbe>
      <Screen edges="none" padded={false} testID="ost-screen">
        <FlatList
          ItemSeparatorComponent={RowDivider}
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
          // New tracks are appended, so the offset holds on its own; this also
          // holds it if the oldest track ever drops off the top of a long day.
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
          renderItem={({ item, index }) => (
            <CueRow
              entry={item}
              index={index}
              onPress={onRowPress}
              state={rowState(item)}
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

function RowDivider() {
  return <Divider inset={CUE_TEXT_INSET} />;
}

const styles = StyleSheet.create({
  header: {
    gap: space.xl,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: layout.minTouch,
  },
  dayNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    flexShrink: 1,
    // The ghost button's glyph sits inside a 36 pt circle; pull it to the page margin.
    marginRight: -space.sm,
  },
  dayLabel: {
    flexShrink: 1,
  },
  album: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.lg,
  },
  albumText: {
    flex: 1,
    gap: space.sm,
  },
  share: {
    alignSelf: 'flex-start',
    marginTop: space.xs,
  },
  rule: {
    marginTop: -space.sm,
  },
});
