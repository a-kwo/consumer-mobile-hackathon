import { StyleSheet, View, useWindowDimensions } from 'react-native';

import { AppText, IconButton, Notice, PressableScale, PrimaryButton } from '@/components/ui';
import type { SensingApi, SessionApi } from '@/lib/score';
import { colors, radius, sizes, space } from '@/theme';

import { CoverStage } from './cover-stage';
import { capitalise, metaLine, nudgeLine, sceneSentence } from './format';
import { NowHeader } from './now-header';
import { PlaybackReadout } from './playback-readout';

/** Phones shorter than this (iPhone SE, small Androids) get the tighter type and gaps. */
const COMPACT_BELOW = 720;

type Props = {
  session: SessionApi;
  sensing: SensingApi;
};

/**
 * Calmer and More energy: equal-width text buttons either side of play and
 * skip. Local rather than the kit's `PillButton` so the label may shrink a
 * little instead of truncating on a 375-wide phone.
 */
function NudgeButton({ label, onPress, testID }: { label: string; onPress: () => void; testID: string }) {
  return (
    <PressableScale
      accessibilityLabel={label}
      containerStyle={styles.nudge}
      fill
      onPress={onPress}
      pressedStyle={styles.nudgePressed}
      style={styles.nudgeButton}
      testID={testID}>
      <AppText adjustsFontSizeToFit minimumFontScale={0.8} numberOfLines={1} variant="button">
        {label}
      </AppText>
    </PressableScale>
  );
}

/**
 * The Now screen while a session runs. 'starting' and 'playing' share this one
 * layout, with every text slot at a fixed height, so nothing moves (and the
 * figure is not resized) when the first song arrives or one cue gives way to
 * the next.
 */
export function NowPlayingView({ session, sensing }: Props) {
  const { height: windowHeight } = useWindowDimensions();
  const compact = windowHeight < COMPACT_BELOW;

  const { track, status, energyBias, nudgePicksLeft, isLoadingNext, error } = session;
  const waiting = status !== 'playing' || !track;
  const scene = session.scene ?? sensing.scene;
  const nudge = nudgeLine(energyBias, nudgePicksLeft);

  return (
    <View style={[styles.root, compact ? styles.rootCompact : null]}>
      <NowHeader mode={sensing.mode} />

      <CoverStage
        bpm={track?.bpm ?? scene.bpm ?? 90}
        coverColor={track?.coverColor}
        coverUrl={track?.coverUrl ?? null}
        energy={track?.energy ?? scene.energy}
        trackId={track?.deezerId ?? null}>
        {error ? <Notice message={error} testID="now-error" tone="warning" /> : null}
      </CoverStage>

      <View style={styles.text}>
        {/* The scene this cue was picked for, as a sentence. */}
        <AppText numberOfLines={1} testID="now-scene-label" tone="muted" variant="sceneLine">
          {sceneSentence(scene)}
        </AppText>

        <View style={compact ? styles.titleCompact : styles.title}>
          <AppText
            accessibilityRole="header"
            adjustsFontSizeToFit
            minimumFontScale={0.75}
            numberOfLines={2}
            style={compact ? styles.titleTextCompact : null}
            testID="now-track-title"
            variant="songTitle">
            {track ? track.title : 'Finding your first cue…'}
          </AppText>
        </View>

        <AppText numberOfLines={1} testID="now-track-artist" tone="muted" variant="artist">
          {track ? track.artist : 'Reading your pace, the weather and the hour'}
        </AppText>

        {/* Why this song. */}
        <View style={styles.reason}>
          <AppText numberOfLines={2} testID="now-reason" tone="soft" variant="body">
            {track ? capitalise(track.reason) : 'Listening to the moment before the first note.'}
          </AppText>
        </View>
      </View>

      <PlaybackReadout coverColor={track?.coverColor} loadingNext={isLoadingNext} waiting={waiting} />

      {/* Calmer, stop, skip, more energy. */}
      <View style={styles.controls}>
        <NudgeButton label="Calmer" onPress={() => session.nudge('calmer')} testID="now-calmer" />
        <PrimaryButton
          accessibilityLabel="Stop scoring"
          icon="stop"
          onPress={session.stop}
          size="lg"
          testID="now-stop"
        />
        <IconButton
          accessibilityLabel="Skip this cue"
          disabled={status !== 'playing'}
          icon="play-skip-forward"
          onPress={session.skip}
          testID="now-skip"
        />
        <NudgeButton label="More energy" onPress={() => session.nudge('more_energy')} testID="now-more-energy" />
      </View>

      {/* One meta line: the moment, and the nudge being carried. */}
      <AppText
        accessibilityLiveRegion="polite"
        align="center"
        numberOfLines={1}
        testID="now-status"
        tone="muted"
        variant="meta">
        {metaLine(sensing.context, session.scene)}
        {nudge ? (
          <AppText testID="now-nudge" tone="primary" variant="meta">
            {` · ${nudge}`}
          </AppText>
        ) : null}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    gap: space.lg,
  },
  rootCompact: {
    gap: space.md,
  },
  text: {
    gap: space.xs,
  },
  // Two lines of the song title, whether or not the title needs both.
  title: {
    height: 80,
    justifyContent: 'center',
  },
  titleCompact: {
    height: 64,
    justifyContent: 'center',
  },
  titleTextCompact: {
    fontSize: 28,
    lineHeight: 32,
    letterSpacing: -0.28,
  },
  reason: {
    height: 44,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm + 2,
  },
  nudge: {
    flex: 1,
  },
  nudgeButton: {
    height: sizes.control,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xs,
    borderRadius: radius.control,
    backgroundColor: colors.paperSunk,
  },
  nudgePressed: {
    backgroundColor: colors.paperPressed,
  },
});
