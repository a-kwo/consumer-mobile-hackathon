import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { FlatList, StyleSheet, View } from 'react-native';

import { feedMeta } from '@/components/feed/feed-card';
import { CUE_TEXT_INSET, CueRow, type CueRowState } from '@/components/ost/cue-row';
import { cueNumber, mosaicCovers, toReplayItems } from '@/components/ost/format';
import { useFeed } from '@/components/ost/queries';
import { TracklistSkeleton } from '@/components/ost/tracklist-skeleton';
import { useMinuteClock } from '@/components/ost/use-clock';
import { ReplayBar, useReplayBarInset, useReplayBarListInset } from '@/components/replay';
import {
  AppText,
  Avatar,
  Chip,
  CoverMosaic,
  Divider,
  EmptyState,
  IconButton,
  PrimaryButton,
  Screen,
  SectionHeader,
  useScreenInsets,
} from '@/components/ui';
import { useProfile, useReplay } from '@/lib/score';
import { colors, ink, layout, space } from '@/theme';

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

  const item = feed?.find((candidate) => candidate.profile.deviceId === friendId);
  const listId = `feed:${friendId}`;
  const playingHere = replay.listId === listId;

  const backButton = (
    <IconButton
      accessibilityLabel="Back to friends"
      icon="chevron-back"
      onPress={goBack}
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
            icon="film-outline"
            message="Their cues are older than the feed keeps. Check back when they score another day."
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

  const play = (index: number) => replay.play(listId, toReplayItems(entries), index);
  const onRowPress = (index: number) => {
    if (playingHere && replay.index === index) replay.stop();
    else play(index);
  };
  const rowState = (index: number): CueRowState => {
    if (!playingHere || replay.index !== index) return 'idle';
    return replay.status === 'loading' ? 'loading' : 'playing';
  };

  const header = (
    <View>
      <View style={styles.topBar}>
        {backButton}
        <AppText variant="overline">Original soundtrack</AppText>
        <View style={styles.topBarBalance} />
      </View>

      <View style={styles.hero}>
        <CoverMosaic
          accessibilityLabel={`Cover of ${profile.displayName}'s soundtrack`}
          shadow
          size={112}
          uris={covers}
        />
        <View style={styles.heroText}>
          <Avatar emoji={profile.avatarEmoji} ring={playingHere} size={36} />
          <AppText
            accessibilityRole="header"
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            numberOfLines={2}
            variant="displayMedium">
            {profile.displayName}
          </AppText>
          <AppText numberOfLines={1} variant="caption">
            {feedMeta(item, now)}
          </AppText>
        </View>
      </View>

      {item.summary ? (
        <AppText style={styles.summary} tone="secondary" variant="serifItalic">
          {item.summary}
        </AppText>
      ) : null}

      {item.topMoods.length > 0 ? (
        <View style={styles.moods}>
          {item.topMoods.map((mood) => (
            <Chip key={mood} label={mood} size="sm" />
          ))}
        </View>
      ) : null}

      <PrimaryButton
        accessibilityLabel={playingHere ? 'Stop playing' : `Play through ${profile.displayName}'s soundtrack`}
        fullWidth
        icon={playingHere ? 'stop' : 'play'}
        label={playingHere ? 'Stop' : 'Play through'}
        onPress={() => (playingHere ? replay.stop() : play(0))}
        size="md"
        style={styles.playThrough}
        testID="friend-play-through"
        variant={playingHere ? 'surface' : 'accent'}
      />

      <SectionHeader detail={cueNumber(entries.length - 1)} style={styles.section} title="Cues" />
    </View>
  );

  return (
    <View style={styles.root}>
      <Screen coverUrl={covers[0]} edges="none" padded={false} testID="friend-screen">
        <FlatList
          ItemSeparatorComponent={CueDivider}
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
              state={rowState(index)}
              testID={`friend-row-${index + 1}`}
            />
          )}
          showsVerticalScrollIndicator={false}
          testID="friend-list"
        />
      </Screen>
      {barSpace > 0 ? (
        // No tab bar here, so rows would show through under the bar: fade them into the base.
        <LinearGradient
          colors={[ink(0), ink(0.94), colors.bg]}
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

function CueDivider() {
  return <Divider inset={CUE_TEXT_INSET} />;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  missing: {
    gap: space.lg,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: layout.minTouch,
  },
  topBarBalance: {
    width: layout.minTouch,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    marginTop: space.lg,
  },
  heroText: {
    flex: 1,
    alignItems: 'flex-start',
    gap: space.xs,
  },
  summary: {
    marginTop: space.lg,
  },
  moods: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    marginTop: space.md,
  },
  playThrough: {
    marginTop: space.xl,
  },
  section: {
    marginTop: space.xl,
    marginBottom: space.xs,
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
