import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { cueCount, formatRelativeTime, mosaicCovers, startOfLocalDay } from '@/components/ost/format';
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
import { colors, layout, radius, space } from '@/theme';

import { TUNING } from '../../../convex/tuning';

export type FeedCardProps = {
  item: FeedItem;
  /** The current time, for "today" and relative times. */
  now: number;
  /** This friend's soundtrack is the one being replayed. */
  playing: boolean;
  onPress: () => void;
  testID: string;
};

/** "today · 8 cues" when the newest cue is from today, otherwise how long ago it was. */
export function feedMeta(item: FeedItem, now: number): string {
  const count = cueCount(item.entries.length);
  if (startOfLocalDay(item.latestAt) === startOfLocalDay(now)) return `today · ${count}`;
  return `${formatRelativeTime(item.latestAt, now)} · ${count}`;
}

/**
 * One friend's soundtrack in the feed, as a preview: who and when, their photo
 * when they added one (the cover mosaic when they did not), their title, the
 * mood the day evoked and its first few songs.
 */
export function FeedCard({ item, now, playing, onPress, testID }: FeedCardProps) {
  const { profile, entries } = item;
  const meta = feedMeta(item, now);
  const covers = mosaicCovers(entries);
  const firstCues = entries.slice(0, TUNING.share.feedPreviewSongs);
  const more = entries.length - firstCues.length;
  // A photo that will not load gives the card back to the mosaic.
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
  const photo = item.leadPhotoUrl && item.leadPhotoUrl !== failedPhoto ? item.leadPhotoUrl : null;

  const preview = (
    <View style={photo ? styles.stackedText : styles.bodyText}>
      {item.title ? (
        <AppText numberOfLines={2} testID={`${testID}-title`} variant="displaySmall">
          {item.title}
        </AppText>
      ) : null}
      {item.summary ? (
        <AppText
          numberOfLines={2}
          style={styles.summary}
          testID={`${testID}-mood`}
          tone={item.title ? 'secondary' : 'primary'}
          variant="serifItalic">
          {item.summary}
        </AppText>
      ) : null}
      <View style={styles.cues} testID={`${testID}-songs`}>
        {firstCues.map((entry) => (
          <AppText key={entry.playId} numberOfLines={1} tone="primary" variant="caption">
            {entry.songTitle}
            <AppText tone="secondary" variant="caption">
              {' — '}
              {entry.artist}
            </AppText>
          </AppText>
        ))}
        {more > 0 ? (
          <AppText numberOfLines={1} tone="tertiary" variant="caption">
            and {cueCount(more)} more
          </AppText>
        ) : null}
      </View>
    </View>
  );

  return (
    <PressableScale
      accessibilityHint="Opens the full tracklist"
      accessibilityLabel={`${profile.displayName}'s soundtrack${item.title ? `, ${item.title}` : ''}, ${meta}${
        item.summary ? `, ${item.summary}` : ''
      }${photo ? ', with a photo' : ''}`}
      containerStyle={styles.container}
      fill
      onPress={onPress}
      pressedStyle={styles.pressed}
      scaleTo={0.985}
      style={[styles.card, playing ? styles.cardPlaying : null]}
      testID={testID}>
      <View style={styles.who}>
        <Avatar emoji={profile.avatarEmoji} ring={playing} size={40} />
        <View style={styles.whoText}>
          <AppText numberOfLines={1} variant="title">
            {profile.displayName}
          </AppText>
          <AppText numberOfLines={1} variant="caption">
            {meta}
          </AppText>
        </View>
        {playing ? <EqualizerBars playing size={16} /> : null}
        <Icon name="chevron-forward" size={16} tone="tertiary" />
      </View>

      {photo ? (
        <>
          <LeadPhoto
            aspect={16 / 9}
            covers={covers}
            onError={() => setFailedPhoto(photo)}
            testID={`${testID}-photo`}
            uri={photo}
          />
          {preview}
        </>
      ) : (
        <View style={styles.body}>
          <CoverMosaic size={96} uris={covers} />
          {preview}
        </View>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'stretch',
  },
  card: {
    gap: space.lg,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: layout.hairline,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
  },
  cardPlaying: {
    borderColor: colors.accentBorder,
  },
  pressed: {
    backgroundColor: colors.surfaceRaised,
  },
  who: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  whoText: {
    flex: 1,
    gap: 1,
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
  stackedText: {
    gap: space.sm,
  },
  summary: {
    fontSize: 18,
    lineHeight: 22,
  },
  cues: {
    gap: space.xxs,
  },
});
