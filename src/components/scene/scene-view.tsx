import { router, useIsFocused } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';

import { sceneSentence } from '@/components/now/format';
import { LiveEqualizer } from '@/components/now/playback-readout';
import { AppText, CoverArt, Icon, PillButton, PressableScale } from '@/components/ui';
import type { SensingApi, SessionApi } from '@/lib/score';
import { colors, fonts, radius, sizes, space } from '@/theme';

import { DemoSheet } from './demo-sheet';
import { FindingRow } from './finding-row';
import { BUTTON_SIZE, Instrument, type InstrumentPhase } from './instrument';
import { Dissolve, Rise } from './motion';
import { STEP_LABEL, liveFindings, type StepId } from './steps';

/** How long the finished reading stays on screen before the app moves to Now. */
const HANDOFF_MS = 900;
const HEADER_HEIGHT = 28;
const HEADLINE_HEIGHT = 76;
const COMPACT_BELOW = 720;

type Props = {
  sensing: SensingApi;
  session: SessionApi;
};

type Row = { id: StepId; text: string; working: boolean };

/**
 * The Scene screen, in its three states:
 *
 * - at rest: the wordmark, one line, and the large "Set the scene" button with
 *   the figure settling around it;
 * - reading the moment: the button draws in, the engine's steps appear one at
 *   a time and resolve into findings, and the scene sentence composes itself
 *   above them. When the first song is picked the app moves to Now by itself;
 * - set: the same findings as a quiet list that follows the live context, the
 *   song that is playing, and a control to read the moment again.
 *
 * The rows keep their identity across the last two states, so the reading
 * turns into the list without anything being redrawn.
 */
export function SceneView({ sensing, session }: Props) {
  const focused = useIsFocused();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const compact = windowHeight < COMPACT_BELOW;
  const [bodyHeight, setBodyHeight] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);

  const { setup, beginSetup } = sensing;
  const reading = setup.status === 'running';
  const isSet = setup.status === 'done';
  const failed = setup.status === 'failed';
  const phase: InstrumentPhase = reading ? 'reading' : isSet ? 'away' : 'rest';

  // When the reading finishes, the song is starting: go and meet it on Now.
  const previousStatus = useRef(setup.status);
  useEffect(() => {
    const was = previousStatus.current;
    previousStatus.current = setup.status;
    if (was !== 'running' || setup.status !== 'done' || !focused) return;
    const timer = setTimeout(() => router.navigate('/now'), HANDOFF_MS);
    return () => clearTimeout(timer);
  }, [setup.status, focused]);

  const onLayout = (event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.height);
    if (next !== bodyHeight) setBodyHeight(next);
  };

  // The stage takes what the rest leaves when the button is the whole screen,
  // a short band while the moment is read, and nothing once the scene is set.
  const available = bodyHeight > 0 ? bodyHeight : windowHeight - 180;
  const restHeight = Math.max(
    BUTTON_SIZE + space.xl,
    available - HEADER_HEIGHT - HEADLINE_HEIGHT - space.lg * 2 - (failed ? 104 : 0)
  );
  const stageHeight = phase === 'rest' ? restHeight : phase === 'reading' ? (compact ? 116 : 190) : 0;

  const done = setup.steps.filter((step) => step.status === 'done').length;
  const targetEnergy = setup.scene?.energy ?? 0.5;
  const figureEnergy = reading ? 0.1 + (done / Math.max(1, setup.steps.length)) * targetEnergy : 0.1;

  const rows: Row[] = reading
    ? setup.steps
        .filter((step) => step.status !== 'waiting')
        .map((step) => ({
          id: step.id,
          text: step.status === 'done' ? (step.detail ?? step.title) : step.title,
          working: step.status === 'working',
        }))
    : isSet
      ? liveFindings(sensing).map((finding) => ({ ...finding, working: false }))
      : [];

  const scene = isSet ? sensing.scene : setup.scene;
  const sentence = scene ? sceneSentence(scene) : null;
  const { track } = session;
  const sessionActive = session.status !== 'idle';

  return (
    <View onLayout={onLayout} style={styles.root}>
      <Rise style={styles.header}>
        <AppText accessibilityRole="header" variant="wordmark">
          Score
        </AppText>
      </Rise>

      <View style={phase === 'rest' ? styles.headline : styles.headlineOpen}>
        {phase === 'rest' ? (
          <Rise delay={140} key={failed ? 'failed' : 'rest'}>
            <AppText adjustsFontSizeToFit minimumFontScale={0.85} numberOfLines={2} variant="screenTitle">
              {failed ? 'That didn’t come together.' : 'What does right now sound like?'}
            </AppText>
          </Rise>
        ) : (
          // Keyed by its words: each time the sentence changes, the new one dissolves in.
          <Dissolve duration={600} key={sentence ?? 'reading'}>
            <AppText
              accessibilityRole="header"
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              numberOfLines={3}
              style={compact ? styles.sentenceCompact : styles.sentence}
              testID="scene-sentence"
              tone={sentence ? 'primary' : 'muted'}>
              {sentence ?? 'Reading the moment…'}
            </AppText>
          </Dissolve>
        )}
      </View>

      <Instrument
        active={focused}
        energy={figureEnergy}
        figureWidth={Math.min(windowWidth, 430)}
        height={stageHeight}
        kick={reading ? done : 0}
        label="Set the scene"
        onLongPress={() => setSheetOpen(true)}
        onPress={beginSetup}
        phase={phase}
      />

      {failed ? (
        <Rise style={styles.failure}>
          <AppText align="center" numberOfLines={3} testID="scene-error" tone="soft" variant="body">
            {setup.error ?? 'Score couldn’t read the moment just now.'}
          </AppText>
          <PillButton label="Try again" onPress={beginSetup} size="sm" testID="scene-retry" />
        </Rise>
      ) : null}

      {rows.length > 0 ? (
        <View style={styles.list} testID="scene-steps">
          {rows.map((row, index) => (
            <FindingRow
              divided={index > 0}
              id={row.id}
              key={row.id}
              label={STEP_LABEL[row.id]}
              text={row.text}
              working={row.working}
            />
          ))}
        </View>
      ) : null}

      {isSet ? (
        <Rise delay={120} style={styles.note}>
          <AppText tone="muted" variant="meta">
            {sessionActive
              ? 'Score keeps listening, and the music follows as this changes.'
              : 'The music has stopped. Set the scene again to bring it back.'}
          </AppText>
        </Rise>
      ) : null}

      {isSet ? (
        <Rise delay={200} style={styles.after}>
          {sessionActive ? (
            <PressableScale
              accessibilityLabel={
                track ? `Now playing ${track.title} by ${track.artist}. Open Now.` : 'Open Now'
              }
              containerStyle={styles.stretch}
              fill
              onPress={() => router.navigate('/now')}
              pressedStyle={styles.playingPressed}
              style={styles.playing}
              testID="scene-now-playing">
              <CoverArt size={sizes.thumb} uri={track?.coverUrl ?? null} />
              <View style={styles.playingText}>
                <View style={styles.playingHeading}>
                  <LiveEqualizer size={11} />
                  <AppText numberOfLines={1} tone="muted" variant="meta">
                    {track ? 'Now playing' : 'Starting the music'}
                  </AppText>
                </View>
                <AppText numberOfLines={1} variant="button">
                  {track ? `${track.title} · ${track.artist}` : 'Your first song is on its way'}
                </AppText>
              </View>
              <Icon name="chevron-forward" size={18} tone="muted" />
            </PressableScale>
          ) : null}
          <PressableScale
            accessibilityLabel="Set the scene again"
            containerStyle={styles.stretch}
            delayLongPress={600}
            fill
            onLongPress={() => setSheetOpen(true)}
            onPress={beginSetup}
            pressedStyle={styles.againPressed}
            style={styles.again}
            testID="scene-set-again">
            <AppText variant="button">Set the scene again</AppText>
          </PressableScale>
        </Rise>
      ) : null}

      <DemoSheet onClose={() => setSheetOpen(false)} sensing={sensing} visible={sheetOpen} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    gap: space.lg,
  },
  header: {
    height: HEADER_HEIGHT,
    justifyContent: 'center',
    // The figure's box ends in opaque paper; the wordmark stays on top of it.
    zIndex: 1,
  },
  headline: {
    height: HEADLINE_HEIGHT,
    justifyContent: 'flex-end',
    zIndex: 1,
  },
  headlineOpen: {
    minHeight: 60,
    justifyContent: 'flex-end',
    zIndex: 1,
  },
  sentence: {
    fontFamily: fonts.serifItalic,
    fontSize: 28,
    lineHeight: 34,
  },
  sentenceCompact: {
    fontFamily: fonts.serifItalic,
    fontSize: 24,
    lineHeight: 30,
  },
  note: {
    marginTop: -space.xs,
  },
  failure: {
    alignItems: 'center',
    gap: space.md,
    minHeight: 88,
  },
  list: {
    alignSelf: 'stretch',
  },
  after: {
    flex: 1,
    justifyContent: 'flex-end',
    gap: space.md,
  },
  stretch: {
    alignSelf: 'stretch',
  },
  playing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.control,
    backgroundColor: colors.paperRaised,
  },
  playingPressed: {
    backgroundColor: colors.paperSunk,
  },
  playingText: {
    flex: 1,
    gap: space.xxs,
  },
  playingHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  again: {
    height: sizes.control,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.control,
    backgroundColor: colors.paperSunk,
  },
  againPressed: {
    backgroundColor: colors.paperPressed,
  },
});
