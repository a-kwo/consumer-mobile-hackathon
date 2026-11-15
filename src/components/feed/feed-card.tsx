import { StyleSheet, View } from 'react-native';

import {
  formatRelativeTime,
  sentenceCase,
  startOfLocalDay,
  trackCount,
} from '@/components/ost/format';
import type { FeedItem } from '@/components/ost/queries';
import {
  AppText,
  Avatar,
  EqualizerBars,
  Icon,
  PressableScale,
} from '@/components/ui';
import { space } from '@/theme';


export type FeedCardProps = {
  item: FeedItem;
  /** Their city, when the feed knows it. */
  placeLabel?: string;
  /** The current time, for "today" and relative times. */
  now: number;
  /** This friend's soundtrack is the one being replayed. */
  playing: boolean;
  /** This friend is the one the map is showing. */
  selected?: boolean;
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
 * One friend in the list under the map: who, where and when, and their title
 * or the mood of their day. Tapping it shows them on the map, where their
 * cover, photo and first tracks are. It is a passage on the page, not a card:
 * entries are separated by hairlines in the list.
 */
export function FeedCard({
  item,
  placeLabel,
  now,
  playing,
  selected = false,
  onPress,
  testID,
}: FeedCardProps) {
  const { profile } = item;
  const meta = [placeLabel, feedMeta(item, now)].filter(Boolean).join(' · ');

  return (
    <PressableScale
      accessibilityHint="Shows their day on the map"
      accessibilityLabel={`${profile.displayName}'s soundtrack${
        item.title ? `, ${item.title}` : ''
      }, ${meta}${item.summary ? `, ${item.summary}` : ''}`}
      accessibilityState={{ selected }}
      containerStyle={styles.container}
      fill
      onPress={onPress}
      pressedOpacity={0.6}
      scaleTo={0.985}
      style={styles.entry}
      testID={testID}>
      <Avatar emoji={profile.avatarEmoji} ring={selected} size={40} />
      <View style={styles.text}>
        <AppText numberOfLines={1} tone="primary" variant="artist">
          {profile.displayName}
        </AppText>
        <AppText numberOfLines={1} variant="meta">
          {meta}
        </AppText>
        {item.title ? (
          <AppText numberOfLines={1} testID={`${testID}-title`} variant="entryTitle">
            {item.title}
          </AppText>
        ) : item.summary ? (
          <AppText numberOfLines={1} testID={`${testID}-mood`} variant="sceneLine">
            {sentenceCase(item.summary)}
          </AppText>
        ) : null}
      </View>
      {playing ? <EqualizerBars playing size={14} /> : null}
      <Icon name="chevron-forward" size={16} tone="muted" />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'stretch',
  },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
  },
  text: {
    flex: 1,
  },
});
