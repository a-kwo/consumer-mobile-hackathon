import { StyleSheet, View } from 'react-native';

import {
  formatRelativeTime,
  mosaicCovers,
  sentenceCase,
  startOfLocalDay,
  trackCount,
} from '@/components/ost/format';
import type { FeedItem } from '@/components/ost/queries';
import {
  AppText,
  Avatar,
  CoverMosaic,
  EqualizerBars,
  Icon,
  PressableScale,
} from '@/components/ui';
import { space } from '@/theme';

export type FeedCardProps = {
  item: FeedItem;
  /** The current time, for "today" and relative times. */
  now: number;
  /** This friend's soundtrack is the one being replayed. */
  playing: boolean;
  onPress: () => void;
  testID: string;
};

/** "Today · 8 tracks" when the newest track is from today, otherwise how long ago it was. */
export function feedMeta(item: FeedItem, now: number): string {
  const count = trackCount(item.entries.length);
  if (startOfLocalDay(item.latestAt) === startOfLocalDay(now)) return `Today · ${count}`;
  return `${sentenceCase(formatRelativeTime(item.latestAt, now))} · ${count}`;
}

/**
 * One friend's soundtrack in the feed: who, when, the cover, the mood and the
 * first tracks. It is a passage on the page, not a card: entries are separated
 * by hairlines in the list.
 */
export function FeedCard({ item, now, playing, onPress, testID }: FeedCardProps) {
  const { profile, entries } = item;
  const meta = feedMeta(item, now);
  const firstTracks = entries.slice(0, 3);

  return (
    <PressableScale
      accessibilityHint="Opens the full tracklist"
      accessibilityLabel={`${profile.displayName}'s soundtrack, ${meta}${
        item.summary ? `, ${item.summary}` : ''
      }`}
      containerStyle={styles.container}
      fill
      onPress={onPress}
      pressedOpacity={0.6}
      scaleTo={0.985}
      style={styles.entry}
      testID={testID}>
      <View style={styles.who}>
        <Avatar emoji={profile.avatarEmoji} size={40} />
        <View style={styles.whoText}>
          <AppText numberOfLines={1} tone="primary" variant="artist">
            {profile.displayName}
          </AppText>
          <AppText numberOfLines={1} variant="meta">
            {meta}
          </AppText>
        </View>
        {playing ? <EqualizerBars playing size={14} /> : null}
        <Icon name="chevron-forward" size={16} tone="muted" />
      </View>

      <View style={styles.body}>
        <CoverMosaic size={96} uris={mosaicCovers(entries)} />
        <View style={styles.bodyText}>
          {item.summary ? (
            <AppText numberOfLines={2} variant="sceneLine">
              {sentenceCase(item.summary)}
            </AppText>
          ) : null}
          <View>
            {firstTracks.map((entry) => (
              <AppText key={entry.playId} numberOfLines={1} tone="soft" variant="meta">
                {entry.title}
              </AppText>
            ))}
          </View>
        </View>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'stretch',
  },
  entry: {
    gap: space.lg,
    paddingVertical: space.xl,
  },
  who: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  whoText: {
    flex: 1,
  },
  body: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
  },
  bodyText: {
    flex: 1,
    gap: space.sm,
  },
});
