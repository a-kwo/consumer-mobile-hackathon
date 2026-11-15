import { useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';

import { AppText, IconButton, Notice, PrimaryButton } from '@/components/ui';
import type { SensingApi, SessionApi } from '@/lib/score';
import { colors, fonts, space } from '@/theme';

import { ContextChips } from './context-chips';
import { capitalise, nudgeLine } from './format';
import { ModeBadge } from './mode-badge';
import { OccasionChip } from './occasion-chip';
import { PlaybackReadout, PulsingCover } from './playback-readout';

/** Phones shorter than this (iPhone SE, small Androids) get the tighter type and gaps. */
const COMPACT_BELOW = 720;
const MAX_COVER = 340;
/** Room left around the cover for its pulse and shadow. */
const COVER_MARGIN = 10;

type Props = {
  session: SessionApi;
  sensing: SensingApi;
};

/**
 * The Now screen while a session runs. 'starting' and 'playing' share this one
 * layout, with every text slot at a fixed height, so nothing moves when the
 * first song arrives or when one cue gives way to the next.
 */
export function NowPlayingView({ session, sensing }: Props) {
  const { height: windowHeight } = useWindowDimensions();
  const compact = windowHeight < COMPACT_BELOW;
  const [coverBox, setCoverBox] = useState<{ width: number; height: number } | null>(null);

  const { track, status, energyBias, nudgePicksLeft, isLoadingNext, error } = session;
  const waiting = status !== 'playing' || !track;
  const scene = session.scene ?? sensing.scene;
  const nudge = nudgeLine(energyBias, nudgePicksLeft);
  const nudgeTone = energyBias < 0 ? 'calm' : 'energy';

  const onCoverLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (!coverBox || coverBox.width !== width || coverBox.height !== height) {
      setCoverBox({ width, height });
    }
  };
  const coverSize = coverBox
    ? Math.max(
        0,
        Math.floor(Math.min(coverBox.width, coverBox.height - COVER_MARGIN * 2, MAX_COVER))
      )
    : 0;

  return (
    <View style={[styles.root, compact ? styles.rootCompact : null]}>
      {/* Slate: mode on the left, what is happening on the right. */}
      <View style={styles.slate}>
        <ModeBadge active mode={sensing.mode} />
        <AppText numberOfLines={1} tone={waiting ? 'tertiary' : 'accent'} variant="overline">
          {waiting ? 'Finding your first cue' : 'Now scoring'}
        </AppText>
      </View>

      {/* Title card: the scene this cue was picked for. */}
      <View style={[styles.titleCard, compact ? styles.titleCardCompact : null]}>
        <AppText
          accessibilityRole="header"
          adjustsFontSizeToFit
          align="center"
          minimumFontScale={0.8}
          numberOfLines={2}
          style={compact ? styles.sceneCompact : null}
          testID="now-scene-label"
          variant="displayMedium">
          {capitalise(scene.label)}
        </AppText>
      </View>

      <ContextChips context={sensing.context} scene={session.scene} />
      <OccasionChip scene={sensing.scene} testID="now-occasion" />

      {/* The cover takes whatever height is left. */}
      <View onLayout={onCoverLayout} style={styles.coverArea}>
        {coverSize > 0 ? (
          <PulsingCover
            accessibilityLabel={
              track ? `Cover of ${track.title} by ${track.artist}` : 'Waiting for the first cue'
            }
            bpm={track?.bpm ?? null}
            size={coverSize}
            uri={track?.coverUrl ?? null}
          />
        ) : null}
        {error ? (
          <Notice message={error} style={styles.notice} testID="now-error" tone="warning" />
        ) : null}
      </View>

      {/* Credits: the song, with skip beside it. */}
      <View style={styles.credits}>
        <View style={styles.creditsSide} />
        <View style={styles.creditsText}>
          <AppText align="center" numberOfLines={1} testID="now-track-title" variant="title">
            {track ? track.title : 'Finding your first cue…'}
          </AppText>
          <AppText align="center" numberOfLines={1} testID="now-track-artist" variant="caption">
            {track ? `${track.artist} · ${Math.round(track.bpm)} BPM` : 'Reading pace, weather and the hour'}
          </AppText>
        </View>
        <View style={styles.creditsSide}>
          <IconButton
            accessibilityLabel="Skip this cue"
            disabled={status !== 'playing'}
            icon="play-skip-forward"
            onPress={session.skip}
            testID="now-skip"
          />
        </View>
      </View>

      {/* Why this song. */}
      <View style={[styles.reason, compact ? styles.reasonCompact : null]}>
        <AppText
          align="center"
          numberOfLines={2}
          style={compact ? styles.reasonTextCompact : null}
          testID="now-reason"
          tone="secondary"
          variant="serifItalic">
          {track ? capitalise(track.reason) : 'Listening to the moment before the first note.'}
        </AppText>
      </View>

      <PlaybackReadout />

      {/* One quiet line: the nudge being carried, and whether the next cue is loading. */}
      <View accessibilityLiveRegion="polite" style={styles.status} testID="now-status">
        {nudge ? (
          <AppText numberOfLines={1} testID="now-nudge" tone={nudgeTone} variant="caption">
            {nudge}
          </AppText>
        ) : null}
        {nudge && isLoadingNext ? (
          <AppText tone="tertiary" variant="caption">
            ·
          </AppText>
        ) : null}
        {isLoadingNext ? (
          <View style={styles.loading} testID="now-loading-next">
            <ActivityIndicator color={colors.textTertiary} size="small" style={styles.spinner} />
            <AppText numberOfLines={1} tone="tertiary" variant="caption">
              {waiting ? 'Cueing the first song' : 'Next cue on its way'}
            </AppText>
          </View>
        ) : null}
      </View>

      {/* Transport: calmer, stop, more energy. */}
      <View style={styles.transport}>
        <View style={styles.control}>
          <IconButton
            accessibilityLabel="Calmer"
            icon="moon-outline"
            onPress={() => session.nudge('calmer')}
            selected={!!nudge && energyBias < 0}
            size="lg"
            testID="now-calmer"
          />
          <AppText numberOfLines={1} tone={nudge && energyBias < 0 ? 'accent' : 'tertiary'} variant="overline">
            Calmer
          </AppText>
        </View>
        <View style={styles.control}>
          <PrimaryButton
            accessibilityLabel="Stop scoring"
            icon="stop"
            onPress={session.stop}
            size={compact ? 'md' : 'lg'}
            testID="now-stop"
            variant="surface"
          />
          <AppText numberOfLines={1} tone="secondary" variant="overline">
            Stop
          </AppText>
        </View>
        <View style={styles.control}>
          <IconButton
            accessibilityLabel="More energy"
            icon="flash-outline"
            onPress={() => session.nudge('more_energy')}
            selected={!!nudge && energyBias > 0}
            size="lg"
            testID="now-more-energy"
          />
          <AppText numberOfLines={1} tone={nudge && energyBias > 0 ? 'accent' : 'tertiary'} variant="overline">
            More energy
          </AppText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    gap: space.md + 2,
  },
  rootCompact: {
    gap: space.sm,
  },
  slate: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    height: 26,
  },
  titleCard: {
    height: 72,
    justifyContent: 'center',
  },
  titleCardCompact: {
    height: 62,
  },
  sceneCompact: {
    fontSize: 28,
    lineHeight: 31,
  },
  coverArea: {
    flex: 1,
    minHeight: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notice: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.bgRaised,
  },
  credits: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    height: 44,
  },
  creditsSide: {
    width: 44,
    alignItems: 'center',
  },
  creditsText: {
    flex: 1,
    gap: space.xxs,
  },
  reason: {
    height: 52,
    justifyContent: 'center',
    paddingHorizontal: space.sm,
  },
  reasonCompact: {
    height: 42,
  },
  reasonTextCompact: {
    fontFamily: fonts.serifItalic,
    fontSize: 17,
    lineHeight: 21,
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    height: 18,
  },
  loading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  spinner: {
    transform: [{ scale: 0.6 }],
  },
  transport: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
  },
  control: {
    alignItems: 'center',
    gap: space.xs + 2,
    minWidth: 92,
  },
});
