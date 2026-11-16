import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, StyleSheet, View, useWindowDimensions } from 'react-native';

import { FeedCard } from '@/components/feed/feed-card';
import { FriendMapCard } from '@/components/feed/friend-map-card';
import { FriendsGlobe, type GlobeFriend } from '@/components/map/friends-globe';
import { placeOf, useMyPlace } from '@/components/map/places';
import { toReplayItems } from '@/components/ost/format';
import { useFeed } from '@/components/ost/queries';
import { TracklistSkeleton } from '@/components/ost/tracklist-skeleton';
import { useMinuteClock } from '@/components/ost/use-clock';
import { TabBarProbe, useReplayBarInset, useReplayBarListInset } from '@/components/replay';
import {
  AppText,
  Avatar,
  Divider,
  EmptyState,
  PressableScale,
  Screen,
  useScreenInsets,
} from '@/components/ui';
import { albumInk } from '@/lib/album-ink';
import { useProfile, useReplay } from '@/lib/score';
import { colors, layout, radius, space } from '@/theme';

const HOUR = 60 * 60 * 1000;
/** The globe takes this share of the screen above the tab bar. */
const GLOBE_SHARE = 0.62;

/**
 * The Friends tab: a globe with a marker for each friend, and a short list of
 * the same friends peeking out underneath. Choosing one (on the globe or in
 * the list) turns the globe to them and raises a card with their day.
 */
export default function FriendsScreen() {
  const { deviceId, profile } = useProfile();
  const replay = useReplay();
  const feed = useFeed(deviceId);
  const me = useMyPlace(deviceId);
  const now = useMinuteClock();
  const insets = useScreenInsets();
  const replayInset = useReplayBarInset();
  const listInset = useReplayBarListInset();
  const window = useWindowDimensions();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Measured, so the globe can be sized against the real screen and kept clear of the card.
  const [screenHeight, setScreenHeight] = useState<number | null>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [cardHeight, setCardHeight] = useState(0);

  const globeWidth = Math.min(window.width, layout.maxContentWidth);
  // The screen above the tab bar; until it is measured, most of the window.
  const aboveTabBar = (screenHeight ?? window.height * 0.9) - insets.bottom;
  const globeHeight = Math.round(aboveTabBar * GLOBE_SHARE);

  const friends = (feed ?? []).map((item, index) => {
    const id = item.profile.deviceId;
    return { item, id, place: placeOf(item), listId: `feed:${id}`, number: index + 1 };
  });
  const selected = friends.find((friend) => friend.id === selectedId) ?? null;

  const markers: GlobeFriend[] = friends.flatMap((friend) =>
    friend.place
      ? [
          {
            id: friend.id,
            place: friend.place,
            emoji: friend.item.profile.avatarEmoji,
            name: friend.item.profile.displayName,
            // The newest track's cover gives the ring its colour.
            tint: albumInk(friend.item.entries.at(-1)?.coverColor, colors.ink),
            recent: now - friend.item.latestAt < HOUR,
            playing: replay.listId === friend.listId,
            testID: `feed-marker-${friend.number}`,
          },
        ]
      : []
  );

  const playingSelected = !!selected && replay.listId === selected.listId;
  // The replay holds a snapshot of the list, so the playing track is matched on the item itself.
  const playingIndex =
    playingSelected && selected
      ? selected.item.entries.findIndex(
          (entry) =>
            replay.item?.deezerId === entry.deezerId && replay.item?.subtitle === entry.title
        )
      : -1;

  const togglePlay = () => {
    if (!selected) return;
    if (playingSelected) replay.stop();
    else replay.play(selected.listId, toReplayItems(selected.item.entries), 0);
  };

  // How far the raised card reaches up over the globe.
  const cardBottom = insets.bottom + space.sm + replayInset;
  const cardTop = (screenHeight ?? 0) - cardBottom - cardHeight;
  const coveredBottom =
    selected && screenHeight !== null && cardHeight > 0
      ? Math.max(0, headerHeight + globeHeight - cardTop)
      : 0;

  const empty =
    feed === undefined ? (
      <TracklistSkeleton rows={2} testID="feed-loading" />
    ) : (
      <EmptyState
        fill={false}
        message="When friends score their day, they appear on the globe and in this list."
        testID="feed-empty"
        title="No soundtracks yet"
      />
    );

  return (
    <TabBarProbe>
      <Screen edges="none" padded={false} testID="feed-screen">
        <View
          onLayout={(event) => setScreenHeight(event.nativeEvent.layout.height)}
          style={styles.fill}>
          <View
            onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}
            style={[styles.header, { paddingTop: insets.top + space.sm }]}>
            <View style={styles.topBar}>
              <AppText variant="wordmark">Rubato</AppText>
              <PressableScale
                accessibilityHint="Edit your name and emoji"
                accessibilityLabel={`Your profile${profile ? `, ${profile.displayName}` : ''}`}
                onPress={() => router.push('/profile')}
                pressedStyle={styles.profilePressed}
                style={styles.profile}
                testID="profile-edit">
                <Avatar
                  emoji={profile?.avatarEmoji ?? '🎬'}
                  size={28}
                  style={styles.profileAvatar}
                />
                <AppText numberOfLines={1} style={styles.profileName} variant="button">
                  {profile?.displayName ?? 'You'}
                </AppText>
              </PressableScale>
            </View>
            <AppText accessibilityRole="header" style={styles.title} variant="screenTitle">
              Other people’s days
            </AppText>
          </View>

          <View style={styles.globe}>
            <FriendsGlobe
              coveredBottom={coveredBottom}
              friends={markers}
              height={globeHeight}
              me={me}
              onSelect={setSelectedId}
              selectedId={selected?.place ? selected.id : null}
              testID="feed-map"
              width={globeWidth}
            />
          </View>
          <Divider />

          <FlatList
            ItemSeparatorComponent={Divider}
            ListEmptyComponent={empty}
            contentContainerStyle={{
              paddingBottom: insets.bottom + layout.tabBarClearance + listInset,
              paddingHorizontal: layout.screenPadding,
            }}
            contentInsetAdjustmentBehavior="never"
            data={friends}
            keyExtractor={(friend) => friend.id}
            renderItem={({ item: friend }) => (
              <FeedCard
                item={friend.item}
                now={now}
                onPress={() => setSelectedId(friend.id === selectedId ? null : friend.id)}
                placeLabel={friend.place?.label}
                playing={replay.listId === friend.listId}
                selected={friend.id === selectedId}
                testID={`feed-card-${friend.number}`}
              />
            )}
            showsVerticalScrollIndicator={false}
            style={styles.fill}
            testID="feed-list"
          />

          <FriendMapCard
            item={selected?.item ?? null}
            now={now}
            onClose={() => setSelectedId(null)}
            onHeight={setCardHeight}
            onOpen={() => {
              if (!selected) return;
              router.push({ pathname: '/friend/[deviceId]', params: { deviceId: selected.id } });
            }}
            onPlay={togglePlay}
            placeLabel={selected?.place?.label}
            playing={playingSelected}
            playingIndex={playingIndex >= 0 ? playingIndex : null}
            style={{ bottom: cardBottom }}
          />
        </View>
      </Screen>
    </TabBarProbe>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  header: {
    gap: space.xs,
    paddingHorizontal: layout.screenPadding,
    paddingBottom: space.xs,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    minHeight: layout.minTouch,
  },
  // The title is kept small here: the globe is the headline.
  title: {
    fontSize: 24,
    lineHeight: 28,
    letterSpacing: -0.24,
  },
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    maxWidth: 220,
    height: layout.minTouch,
    paddingLeft: space.sm,
    paddingRight: space.lg,
    borderRadius: radius.control,
    backgroundColor: colors.paperSunk,
  },
  profilePressed: {
    backgroundColor: colors.paperPressed,
  },
  profileAvatar: {
    backgroundColor: colors.paperRaised,
  },
  profileName: {
    flexShrink: 1,
  },
  globe: {
    alignItems: 'center',
  },
});
