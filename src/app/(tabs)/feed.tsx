import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, StyleSheet, View, useWindowDimensions } from 'react-native';

import { FeedCard } from '@/components/feed/feed-card';
import { FriendMapCard } from '@/components/feed/friend-map-card';
import { placeOf, stopsOf, useMyPlace } from '@/components/map/places';
import { WorldMap, type MapFriend } from '@/components/map/world-map';
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

/**
 * The Friends tab: a map of the world with a marker for each friend, and the
 * same friends as a list underneath. Choosing one (on the map or in the list)
 * zooms the map to them and raises a card with their day.
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
  const mapWidth = Math.min(window.width, layout.maxContentWidth);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const friends = (feed ?? []).map((item, index) => {
    const id = item.profile.deviceId;
    const place = placeOf(item);
    return { item, id, place, listId: `feed:${id}`, number: index + 1 };
  });
  const selected = friends.find((friend) => friend.id === selectedId) ?? null;

  const markers: MapFriend[] = friends.flatMap((friend) =>
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

  const stops = selected ? stopsOf(selected.item) : [];
  const playingSelected = !!selected && replay.listId === selected.listId;
  // The replay holds a snapshot of the list, so the playing track is matched on the item itself.
  const activeStopIndex =
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

  const empty =
    feed === undefined ? (
      <TracklistSkeleton rows={3} testID="feed-loading" />
    ) : (
      <EmptyState
        fill={false}
        message="When friends score their day, they appear on the map and in this list."
        testID="feed-empty"
        title="No soundtracks yet"
      />
    );

  return (
    <TabBarProbe>
      <Screen edges="none" padded={false} testID="feed-screen">
        <View style={[styles.header, { paddingTop: insets.top + space.md }]}>
          <View style={styles.topBar}>
            <AppText variant="wordmark">Score</AppText>
            <PressableScale
              accessibilityHint="Edit your name and emoji"
              accessibilityLabel={`Your profile${profile ? `, ${profile.displayName}` : ''}`}
              onPress={() => router.push('/profile')}
              pressedStyle={styles.profilePressed}
              style={styles.profile}
              testID="profile-edit">
              <Avatar emoji={profile?.avatarEmoji ?? '🎬'} size={28} style={styles.profileAvatar} />
              <AppText numberOfLines={1} style={styles.profileName} variant="button">
                {profile?.displayName ?? 'You'}
              </AppText>
            </PressableScale>
          </View>
          <AppText accessibilityRole="header" variant="screenTitle">
            Other people’s days
          </AppText>
        </View>

        <View style={styles.map}>
          <Divider />
          <WorldMap
            activeStopIndex={activeStopIndex >= 0 ? activeStopIndex : null}
            friends={markers}
            me={me}
            onSelect={setSelectedId}
            selectedId={selected?.place ? selected.id : null}
            stops={stops}
            testID="feed-map"
            width={mapWidth}
          />
          <Divider />
        </View>

        <FlatList
          ItemSeparatorComponent={Divider}
          ListEmptyComponent={empty}
          contentContainerStyle={{
            paddingBottom:
              insets.bottom + layout.tabBarClearance + layout.scrollEndPadding + listInset,
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
          style={styles.list}
          testID="feed-list"
        />

        <FriendMapCard
          item={selected?.item ?? null}
          now={now}
          onClose={() => setSelectedId(null)}
          onOpen={() => {
            if (!selected) return;
            router.push({ pathname: '/friend/[deviceId]', params: { deviceId: selected.id } });
          }}
          onPlay={togglePlay}
          placeLabel={selected?.place?.label}
          playing={playingSelected}
          style={{ bottom: insets.bottom + space.sm + replayInset }}
        />
      </Screen>
    </TabBarProbe>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: space.md,
    paddingHorizontal: layout.screenPadding,
    paddingBottom: space.lg,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    minHeight: layout.minTouch,
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
  map: {
    alignItems: 'center',
  },
  list: {
    flex: 1,
  },
});
