import { router } from 'expo-router';
import { FlatList, StyleSheet, View } from 'react-native';

import { FeedCard } from '@/components/feed/feed-card';
import { useFeed } from '@/components/ost/queries';
import { TracklistSkeleton } from '@/components/ost/tracklist-skeleton';
import { useMinuteClock } from '@/components/ost/use-clock';
import { TabBarProbe, useReplayBarListInset } from '@/components/replay';
import {
  AppText,
  Avatar,
  Divider,
  EmptyState,
  PressableScale,
  Screen,
  useScreenInsets,
} from '@/components/ui';
import { useProfile, useReplay } from '@/lib/score';
import { colors, layout, radius, space } from '@/theme';

/** The Friends tab: other people's soundtracks, newest first. */
export default function FriendsScreen() {
  const { deviceId, profile } = useProfile();
  const replay = useReplay();
  const feed = useFeed(deviceId);
  const now = useMinuteClock();
  const insets = useScreenInsets();
  const replayInset = useReplayBarListInset();

  const header = (
    <View style={styles.header}>
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
      <Divider style={styles.rule} />
    </View>
  );

  const empty =
    feed === undefined ? (
      <TracklistSkeleton rows={5} testID="feed-loading" />
    ) : (
      <EmptyState
        fill={false}
        message="When friends score their day, their soundtracks show up here."
        testID="feed-empty"
        title="No soundtracks yet"
      />
    );

  return (
    <TabBarProbe>
      <Screen edges="none" padded={false} testID="feed-screen">
        <FlatList
          ItemSeparatorComponent={Divider}
          ListEmptyComponent={empty}
          ListHeaderComponent={header}
          contentContainerStyle={{
            paddingTop: insets.top + space.md,
            paddingBottom:
              insets.bottom + layout.tabBarClearance + layout.scrollEndPadding + replayInset,
            paddingHorizontal: layout.screenPadding,
          }}
          contentInsetAdjustmentBehavior="never"
          data={feed}
          keyExtractor={(item) => item.profile.deviceId}
          renderItem={({ item, index }) => (
            <FeedCard
              item={item}
              now={now}
              onPress={() =>
                router.push({
                  pathname: '/friend/[deviceId]',
                  params: { deviceId: item.profile.deviceId },
                })
              }
              playing={replay.listId === `feed:${item.profile.deviceId}`}
              testID={`feed-card-${index + 1}`}
            />
          )}
          showsVerticalScrollIndicator={false}
          testID="feed-list"
        />
      </Screen>
    </TabBarProbe>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: space.lg,
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
  rule: {
    marginTop: space.sm,
  },
});
