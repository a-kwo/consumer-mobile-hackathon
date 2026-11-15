import { useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { feedMeta } from '@/components/feed/feed-card';
import { mosaicCovers, sentenceCase, trackCount } from '@/components/ost/format';
import { LeadPhoto } from '@/components/ost/lead-photo';
import type { FeedItem } from '@/components/ost/queries';
import { AppText, CoverMosaic, IconButton, PillButton, PrimaryButton } from '@/components/ui';
import { colors, layout, motion, radius, shadows, space } from '@/theme';

import { TUNING } from '../../../convex/tuning';

export type FriendMapCardProps = {
  /** The friend whose day is showing, or null to lower the card. */
  item: FeedItem | null;
  /** Their city, when known. */
  placeLabel?: string;
  now: number;
  /** This friend's soundtrack is the one being replayed. */
  playing: boolean;
  onPlay: () => void;
  onOpen: () => void;
  onClose: () => void;
  /** Where the card rests: pass `bottom`. */
  style?: StyleProp<ViewStyle>;
};

const COVER = 72;

/**
 * A friend's day, raised from the bottom of the map: who and where, the cover
 * (their photo when they added one), their title or the mood of the day, the
 * first tracks, and the two ways on: play it through, or open the whole
 * soundtrack. It keeps showing the last friend while it slides away.
 */
export function FriendMapCard({
  item,
  placeLabel,
  now,
  playing,
  onPlay,
  onOpen,
  onClose,
  style,
}: FriendMapCardProps) {
  const reduceMotion = useReducedMotion();
  // What the card shows: the last friend it was given, so it can leave gracefully.
  const [shown, setShown] = useState<{ item: FeedItem; placeLabel?: string } | null>(null);
  if (item && (shown?.item !== item || shown.placeLabel !== placeLabel)) {
    setShown({ item, placeLabel });
  }
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);

  const up = item !== null;
  const content = shown?.item ?? null;

  let body = null;
  if (content) {
    const { profile, entries } = content;
    const firstTracks = entries.slice(0, TUNING.share.feedPreviewSongs);
    const more = entries.length - firstTracks.length;
    const photo =
      content.leadPhotoUrl && content.leadPhotoUrl !== failedPhoto ? content.leadPhotoUrl : null;
    const meta = [shown?.placeLabel, feedMeta(content, now)].filter(Boolean).join(' · ');

    body = (
      <>
        <View style={styles.top}>
          {photo ? (
            <LeadPhoto onError={() => setFailedPhoto(photo)} size={COVER} uri={photo} />
          ) : (
            <CoverMosaic size={COVER} uris={mosaicCovers(entries)} />
          )}
          <View style={styles.topText}>
            <AppText accessibilityRole="header" numberOfLines={1} variant="wordmark">
              {profile.displayName}
            </AppText>
            <AppText numberOfLines={1} testID="feed-map-card-meta" variant="meta">
              {meta}
            </AppText>
            {content.title ? (
              <AppText numberOfLines={1} variant="entryTitle">
                {content.title}
              </AppText>
            ) : content.summary ? (
              <AppText numberOfLines={2} variant="sceneLine">
                {sentenceCase(content.summary)}
              </AppText>
            ) : null}
          </View>
          <IconButton
            accessibilityLabel="Close and go back to the whole world"
            icon="close"
            onPress={onClose}
            size="sm"
            testID="feed-map-close"
          />
        </View>

        <View style={styles.tracks}>
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

        <View style={styles.actions}>
          <PrimaryButton
            accessibilityLabel={
              playing ? 'Stop playing' : `Play through ${profile.displayName}'s soundtrack`
            }
            icon={playing ? 'stop' : 'play'}
            label={playing ? 'Stop' : 'Play through'}
            fullWidth
            onPress={onPlay}
            size="lg"
            style={styles.action}
            testID="feed-map-play"
            variant={playing ? 'surface' : 'accent'}
          />
          <PillButton
            accessibilityLabel={`See ${profile.displayName}'s full soundtrack`}
            grow
            label="See full soundtrack"
            onPress={onOpen}
            testID="feed-map-open"
          />
        </View>
      </>
    );
  }

  return (
    <View style={[styles.slot, style]}>
      <Animated.View
        accessibilityElementsHidden={!up}
        importantForAccessibility={up ? 'auto' : 'no-hide-descendants'}
        style={[
          styles.card,
          {
            opacity: up ? 1 : 0,
            transform: [{ translateY: up ? 0 : 48 }],
            pointerEvents: up ? 'auto' : 'none',
            transitionProperty: ['opacity', 'transform'],
            transitionDuration: reduceMotion ? 0 : motion.duration.slow,
            transitionTimingFunction: motion.easing.out,
          },
        ]}
        testID={up ? 'feed-map-card' : undefined}>
        {body}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    position: 'absolute',
    left: space.md,
    right: space.md,
    alignItems: 'center',
    pointerEvents: 'box-none',
  },
  card: {
    width: '100%',
    maxWidth: layout.maxContentWidth,
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.control,
    borderWidth: layout.hairline,
    borderColor: colors.hairline,
    backgroundColor: colors.paperRaised,
    ...shadows.raised,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
  },
  topText: {
    flex: 1,
    gap: space.xxs,
  },
  tracks: {
    gap: 0,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  action: {
    flex: 1,
  },
});
