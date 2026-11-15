import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  formatRelativeTime,
  mosaicCovers,
  sentenceCase,
  startOfLocalDay,
  trackCount,
} from '@/components/ost/format';
import { LeadPhoto } from '@/components/ost/lead-photo';
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

import { TUNING } from '../../../convex/tuning';

const COVER_SIZE = 96;

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
 * One friend's soundtrack in the feed, as a preview: who and when, their photo
 * when they added one (the cover mosaic when they did not), their title, the
 * mood of the day and its first few songs. It is a passage on the page, not a
 * card: entries are separated by hairlines in the list.
 */
export function FeedCard({ item, now, playing, onPress, testID }: FeedCardProps) {
  const { profile, entries } = item;
  const meta = feedMeta(item, now);
  const firstTracks = entries.slice(0, TUNING.share.feedPreviewSongs);
  const more = entries.length - firstTracks.length;
  // A photo that will not load gives its slot back to the mosaic.
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
  const photo = item.leadPhotoUrl && item.leadPhotoUrl !== failedPhoto ? item.leadPhotoUrl : null;

  return (
    <PressableScale
      accessibilityHint="Opens the full tracklist"
      accessibilityLabel={`${profile.displayName}'s soundtrack${
        item.title ? `, ${item.title}` : ''
      }, ${meta}${item.summary ? `, ${item.summary}` : ''}${photo ? ', with a photo' : ''}`}
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
        {photo ? (
          <LeadPhoto
            onError={() => setFailedPhoto(photo)}
            size={COVER_SIZE}
            testID={`${testID}-photo`}
            uri={photo}
          />
        ) : (
          <CoverMosaic size={COVER_SIZE} uris={mosaicCovers(entries)} />
        )}
        <View style={styles.bodyText}>
          {item.title ? (
            <AppText numberOfLines={2} testID={`${testID}-title`} variant="entryTitle">
              {item.title}
            </AppText>
          ) : null}
          {item.summary ? (
            <AppText numberOfLines={2} testID={`${testID}-mood`} variant="sceneLine">
              {sentenceCase(item.summary)}
            </AppText>
          ) : null}
          <View testID={`${testID}-songs`}>
            {firstTracks.map((entry) => (
              <AppText key={entry.playId} numberOfLines={1} tone="soft" variant="meta">
                {entry.songTitle}
                <AppText variant="meta"> · {entry.artist}</AppText>
              </AppText>
            ))}
            {more > 0 ? (
              <AppText numberOfLines={1} variant="meta">
                and {trackCount(more)} more
              </AppText>
            ) : null}
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
