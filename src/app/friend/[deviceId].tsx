import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, StyleSheet, View, useWindowDimensions } from 'react-native';

import { feedMeta } from '@/components/feed/feed-card';
import { DayMap } from '@/components/map/day-map';
import { centreOf, stopsOf } from '@/components/map/places';
import { CUE_TEXT_INSET, CueRow, type CueRowState } from '@/components/ost/cue-row';
import { mosaicCovers, sentenceCase, toReplayItems } from '@/components/ost/format';
import { LeadPhoto } from '@/components/ost/lead-photo';
import { PhotoStrip } from '@/components/ost/photo-strip';
import { useFeed } from '@/components/ost/queries';
import { TracklistSkeleton } from '@/components/ost/tracklist-skeleton';
import { useMinuteClock } from '@/components/ost/use-clock';
import { ReplayBar, useReplayBarInset, useReplayBarListInset } from '@/components/replay';
import {
  AppText,
  Avatar,
  CoverMosaic,
  Divider,
  EmptyState,
  IconButton,
  PrimaryButton,
  Screen,
  useScreenInsets,
} from '@/components/ui';
import { albumInk } from '@/lib/album-ink';
import { useProfile, useReplay, type OstEntry } from '@/lib/score';
import { colors, layout, paperAlpha, sizes, space } from '@/theme';

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/feed');
}

/** A friend's soundtrack: the full tracklist and a control to play it through. */
export default function FriendScreen() {
  const params = useLocalSearchParams<{ deviceId: string }>();
  const friendId = Array.isArray(params.deviceId) ? params.deviceId[0] : params.deviceId;
  const { deviceId } = useProfile();
  const replay = useReplay();
  const feed = useFeed(deviceId);
  const now = useMinuteClock();
  const insets = useScreenInsets();
  const replayInset = useReplayBarListInset();
  const barSpace = useReplayBarInset();
  const window = useWindowDimensions();
  const mapWidth = Math.min(window.width, layout.maxContentWidth) - layout.screenPadding * 2;
  // A photo that will not load gives the cover back to the mosaic.
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);

  const item = feed?.find((candidate) => candidate.profile.deviceId === friendId);
  const listId = `feed:${friendId}`;
  const playingHere = replay.listId === listId;

  const backButton = (
    <IconButton
      accessibilityLabel="Back to friends"
      icon="chevron-back"
      onPress={goBack}
      size="sm"
      style={styles.back}
      testID="friend-back"
    />
  );

  if (!item) {
    return (
      <Screen contentStyle={styles.missing} testID="friend-screen">
        <View style={styles.topBar}>{backButton}</View>
        {feed === undefined ? (
          <TracklistSkeleton rows={5} testID="friend-loading" />
        ) : (
          <EmptyState
            actionLabel="Back to friends"
            message="Their tracks are older than the feed keeps. Check back when they score another day."
            onAction={goBack}
            testID="friend-empty"
            title="This soundtrack has faded"
          />
        )}
      </Screen>
    );
  }

  const { profile, entries } = item;
  const covers = mosaicCovers(entries);
  const leadPhoto =
    item.leadPhotoUrl && item.leadPhotoUrl !== failedPhoto ? item.leadPhotoUrl : null;
  const photoUrls = item.photoUrls ?? [];
  // Where the day went, when it says: a still of the friends map with the stops on it.
  const stops = stopsOf(item);
  const centre = centreOf(item, stops);

  const play = (index: number) => replay.play(listId, toReplayItems(entries), index);

  // The replay plays a snapshot of the list taken when it started, and the live
  // list can shift under it (the oldest track drops off), so the playing row is
  // matched on the item itself, never on its index.
  const isReplaying = (entry: OstEntry) =>
    playingHere &&
    replay.item?.deezerId === entry.deezerId &&
    replay.item?.subtitle === entry.title;

  const onRowPress = (index: number) => {
    if (isReplaying(entries[index])) replay.stop();
    else play(index);
  };
  const rowState = (entry: OstEntry): CueRowState => {
    if (!isReplaying(entry)) return 'idle';
    return replay.status === 'loading' ? 'loading' : 'playing';
  };

  const header = (
    <View style={styles.header}>
      <View style={styles.topBar}>
        {backButton}
        <View style={styles.who}>
          <Avatar emoji={profile.avatarEmoji} size={28} />
          <AppText numberOfLines={1} variant="meta">
            {[centre?.label, feedMeta(item, now)].filter(Boolean).join(' · ')}
          </AppText>
        </View>
      </View>

      {centre && stops.length > 0 ? (
        <DayMap
          activeStopIndex={entries.findIndex(isReplaying)}
          place={centre}
          stops={stops}
          testID="friend-map"
          tint={albumInk(entries.at(-1)?.coverColor, colors.inkMuted)}
          width={mapWidth}
        />
      ) : null}

      <View style={styles.album}>
        {leadPhoto ? (
          <LeadPhoto
            accessibilityLabel={`Photo from ${profile.displayName}'s soundtrack`}
            onError={() => setFailedPhoto(leadPhoto)}
            testID="friend-lead-photo"
            uri={leadPhoto}
          />
        ) : (
          <CoverMosaic
            accessibilityLabel={`Cover of ${profile.displayName}'s soundtrack`}
            size={sizes.soundtrackCover}
            uris={covers}
          />
        )}
        <View style={styles.albumText}>
          {item.title ? (
            <>
              <AppText
                accessibilityRole="header"
                numberOfLines={3}
                testID="friend-title"
                variant="screenTitle">
                {item.title}
              </AppText>
              <AppText numberOfLines={1} variant="meta">
                {profile.displayName}’s soundtrack
              </AppText>
            </>
          ) : (
            <AppText accessibilityRole="header" numberOfLines={3} variant="screenTitle">
              {profile.displayName}’s soundtrack
            </AppText>
          )}
          {item.summary ? (
            <AppText variant="sceneLine">{sentenceCase(item.summary)}</AppText>
          ) : null}
        </View>
      </View>

      {photoUrls.length > 1 ? (
        <PhotoStrip photos={photoUrls.map((url) => ({ key: url, url }))} testID="friend-photo" />
      ) : null}

      <PrimaryButton
        accessibilityLabel={
          playingHere ? 'Stop playing' : `Play through ${profile.displayName}'s soundtrack`
        }
        fullWidth
        icon={playingHere ? 'stop' : 'play'}
        label={playingHere ? 'Stop' : 'Play through'}
        onPress={() => (playingHere ? replay.stop() : play(0))}
        testID="friend-play-through"
        variant={playingHere ? 'surface' : 'accent'}
      />

      <Divider style={styles.rule} />
    </View>
  );

  return (
    <View style={styles.root}>
      <Screen edges="none" padded={false} testID="friend-screen">
        <FlatList
          ItemSeparatorComponent={RowDivider}
          ListHeaderComponent={header}
          contentContainerStyle={{
            paddingTop: insets.top + space.sm,
            paddingBottom: insets.bottom + layout.scrollEndPadding + replayInset,
            paddingHorizontal: layout.screenPadding,
          }}
          contentInsetAdjustmentBehavior="never"
          data={entries}
          keyExtractor={(entry) => entry.playId}
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
          renderItem={({ item: entry, index }) => (
            <CueRow
              entry={entry}
              index={index}
              onPress={onRowPress}
              state={rowState(entry)}
              testID={`friend-row-${index + 1}`}
            />
          )}
          showsVerticalScrollIndicator={false}
          testID="friend-list"
        />
      </Screen>
      {barSpace > 0 ? (
        // No tab bar here, so rows would show through under the bar: fade them into the paper.
        <LinearGradient
          colors={[paperAlpha(0), paperAlpha(0.94), colors.paper]}
          locations={[0, 0.3, 1]}
          style={[styles.scrim, { height: insets.bottom + barSpace + space.xxl }]}
        />
      ) : null}
      <View style={[styles.replayBar, { bottom: insets.bottom + space.sm }]}>
        <ReplayBar style={styles.replayBarCapped} />
      </View>
    </View>
  );
}

function RowDivider() {
  return <Divider inset={CUE_TEXT_INSET} />;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  missing: {
    gap: space.lg,
  },
  header: {
    gap: space.xl,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: layout.minTouch,
  },
  back: {
    // Line the circle's glyph up with the page margin.
    marginLeft: -space.xs,
  },
  who: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
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
  rule: {
    marginTop: -space.sm,
  },
  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: 'none',
  },
  replayBar: {
    position: 'absolute',
    left: space.md,
    right: space.md,
    alignItems: 'center',
    pointerEvents: 'box-none',
  },
  replayBarCapped: {
    width: '100%',
    maxWidth: layout.maxContentWidth,
  },
});
