import { router } from 'expo-router';
import { FlatList, StyleSheet, View } from 'react-native';

import { FeedCard } from '@/components/feed/feed-card';
import { useFeed } from '@/components/ost/queries';
import { useMinuteClock } from '@/components/ost/use-clock';
import { TabBarProbe, useReplayBarInset } from '@/components/replay';
import {
  AppText,
  Avatar,
  EmptyState,
  Icon,
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
  const replayInset = useReplayBarInset();

  const header = (
    <View style={styles.header}>
      <View style={styles.headerText}>
        <AppText variant="overline">Friends</AppText>
        <AppText accessibilityRole="header" variant="displayMedium">
          Other people’s days
        </AppText>
      </View>
      <PressableScale
        accessibilityHint="Edit your name and emoji"
        accessibilityLabel={`Your profile${profile ? `, ${profile.displayName}` : ''}`}
        onPress={() => router.push('/profile')}
        pressedStyle={styles.profilePressed}
        style={styles.profile}
        testID="profile-edit">
        <Avatar emoji={profile?.avatarEmoji ?? '🎬'} size={30} />
        <AppText numberOfLines={1} style={styles.profileName} variant="label">
          {profile?.displayName ?? 'You'}
        </AppText>
        <Icon name="pencil" size={13} tone="secondary" />
      </PressableScale>
    </View>
  );

  const empty =
    feed === undefined ? (
      <View accessibilityLabel="Loading friends" accessible style={styles.loading} testID="feed-loading">
        <View style={styles.skeleton} />
        <View style={styles.skeleton} />
      </View>
    ) : (
      <EmptyState
        fill={false}
        icon="people-outline"
        message="When friends score their day, their soundtracks show up here."
        testID="feed-empty"
        title="No soundtracks yet"
      />
    );

  return (
    <TabBarProbe>
      <Screen edges="none" padded={false} testID="feed-screen">
        <FlatList
          ItemSeparatorComponent={Gap}
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

function Gap() {
  return <View style={styles.gap} />;
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space.md,
    marginBottom: space.xl,
  },
  headerText: {
    flex: 1,
    gap: space.xs,
    paddingTop: space.sm,
  },
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    maxWidth: 170,
    minHeight: layout.minTouch,
    paddingLeft: space.xs + 2,
    paddingRight: space.md,
    borderRadius: radius.pill,
    borderWidth: layout.hairline,
    borderColor: colors.hairlineStrong,
    backgroundColor: colors.surface,
  },
  profilePressed: {
    backgroundColor: colors.surfacePressed,
  },
  profileName: {
    flexShrink: 1,
  },
  gap: {
    height: space.md,
  },
  loading: {
    gap: space.md,
  },
  skeleton: {
    height: 188,
    borderRadius: radius.lg,
    borderWidth: layout.hairline,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
  },
});
