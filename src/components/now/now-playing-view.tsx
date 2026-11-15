import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { css, useReducedMotion } from 'react-native-reanimated';

import { Rise, crossFadeStyle, useCrossFade } from '@/components/scene/motion';

import { AppText, Icon, IconButton, Notice, PressableScale } from '@/components/ui';
import type { SensingApi, SessionApi } from '@/lib/score';
import { colors, radius, sizes, space } from '@/theme';

import { CoverStage } from './cover-stage';
import { capitalise, nudgeLine, sceneSentence } from './format';
import { MetaLine } from './meta-line';
import { NowHeader } from './now-header';
import { PlaybackReadout } from './playback-readout';

const arrive = css.keyframes({
  from: { opacity: 0, transform: [{ scale: 0.92 }] },
  to: { opacity: 1, transform: [{ scale: 1 }] },
});

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
 * The centre control: pause while the song plays, play while it is held. One
 * ink circle whose two glyphs cross-fade. Its testID follows its state
 * (`now-pause` or `now-play`); the wrapper keeps `now-stop`, the id this
 * control had when it stopped the session, so a tap on either lands here.
 */
function PlayPauseButton({
  paused,
  onPause,
  onPlay,
}: {
  paused: boolean;
  onPause: () => void;
  onPlay: () => void;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <View testID="now-stop">
      <PressableScale
        accessibilityLabel={paused ? 'Play' : 'Pause'}
        haptic="press"
        onPress={paused ? onPlay : onPause}
        pressedStyle={styles.playPressed}
        style={styles.play}
        testID={paused ? 'now-play' : 'now-pause'}>
        <Animated.View style={[styles.glyph, crossFadeStyle(!paused, reduceMotion)]}>
          <Icon color={colors.paper} name="pause" size={26} />
        </Animated.View>
        <Animated.View style={[styles.glyph, crossFadeStyle(paused, reduceMotion)]}>
          {/* The play triangle's visual centre sits left of its box. */}
          <Icon color={colors.paper} name="play" size={26} style={styles.playGlyph} />
        </Animated.View>
      </PressableScale>
    </View>
  );
}

/**
 * The Now screen while a session runs. 'starting', 'playing' and 'paused' share this one
 * layout, with every text slot at a fixed height, so nothing moves (and the
 * figure is not resized) when the first song arrives or one cue gives way to
 * the next.
 */
export function NowPlayingView({ session, sensing }: Props) {
  const { height: windowHeight } = useWindowDimensions();
  const compact = windowHeight < COMPACT_BELOW;
  const reduceMotion = useReducedMotion();

  const { track, status, energyBias, nudgePicksLeft, error } = session;
  const paused = status === 'paused';
  const waiting = status === 'starting' || !track;
  const scene = session.scene ?? sensing.scene;
  const nudge = nudgeLine(energyBias, nudgePicksLeft);
  // The song and scene the words are written from: they trail a change of cue by a short fade.
  const words = useCrossFade({ track, scene }, String(track?.deezerId ?? 'waiting'));

  return (
    <View style={[styles.root, compact ? styles.rootCompact : null]}>
      <NowHeader />

      {/* Arrives as the music fades in: the cover grows a little into place. */}
      <Animated.View
        style={[
          styles.arrival,
          reduceMotion
            ? null
            : {
                animationName: arrive,
                animationDuration: 900,
                animationTimingFunction: 'ease-out',
                animationFillMode: 'both',
              },
        ]}>
        <CoverStage
          bpm={track?.bpm ?? scene.bpm ?? 90}
          coverColor={track?.coverColor}
          coverUrl={track?.coverUrl ?? null}
          energy={track?.energy ?? scene.energy}
          trackId={track?.deezerId ?? null}>
          {error ? <Notice message={error} testID="now-error" tone="warning" /> : null}
        </CoverStage>
      </Animated.View>

      {/*
        The words for this song, in a slot of fixed height. When the cue
        changes the old words dissolve out and the new ones dissolve in, in
        step with the cover and the figure's scatter.
      */}
      <View style={compact ? styles.textSlotCompact : styles.textSlot}>
        <Animated.View style={[styles.text, crossFadeStyle(words.visible, reduceMotion)]}>
          {/* The scene this cue was picked for, as a sentence. */}
          <AppText numberOfLines={1} testID="now-scene-label" tone="muted" variant="sceneLine">
            {sceneSentence(words.value.scene)}
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
              {words.value.track ? words.value.track.title : 'Finding your first song…'}
            </AppText>
          </View>

          <AppText numberOfLines={1} testID="now-track-artist" tone="muted" variant="artist">
            {words.value.track ? words.value.track.artist : 'Reading your pace, the weather and the hour'}
          </AppText>

          {/* Why this song. */}
          <View style={styles.reason}>
            <AppText numberOfLines={2} testID="now-reason" tone="soft" variant="body">
              {words.value.track ? capitalise(words.value.track.reason) : 'Listening to the moment before the first note.'}
            </AppText>
          </View>
        </Animated.View>
      </View>

      <Rise delay={260}>
        <PlaybackReadout coverColor={track?.coverColor} paused={paused} waiting={waiting} />
      </Rise>

      {/* Calmer, play or pause, skip, more energy. */}
      <Rise delay={340} style={styles.controls}>
        <NudgeButton label="Calmer" onPress={() => session.nudge('calmer')} testID="now-calmer" />
        <PlayPauseButton onPause={session.pause} onPlay={session.resume} paused={paused} />
        <IconButton
          accessibilityLabel="Skip this cue"
          disabled={status === 'starting'}
          icon="play-skip-forward"
          onPress={session.skip}
          testID="now-skip"
        />
        <NudgeButton label="More energy" onPress={() => session.nudge('more_energy')} testID="now-more-energy" />
      </Rise>

      {/* One meta line: the moment, the place, the occasion ahead, and the nudge being carried. */}
      <Rise delay={420}>
        <MetaLine
          align="center"
          context={sensing.context}
          location={sensing.location}
          nudge={nudge}
          playingScene={session.scene}
          scene={sensing.scene}
          testID="now-status"
        />
      </Rise>
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
  // The stage inside still takes the height that is left.
  arrival: {
    flex: 1,
  },
  // Scene line, two lines of title, artist and two lines of reason.
  textSlot: {
    height: 178,
  },
  textSlotCompact: {
    height: 162,
  },
  text: {
    ...StyleSheet.absoluteFill,
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
  play: {
    width: sizes.play,
    height: sizes.play,
    borderRadius: sizes.play / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.ink,
  },
  playPressed: {
    backgroundColor: colors.inkSoft,
  },
  glyph: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playGlyph: {
    marginLeft: 3,
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
