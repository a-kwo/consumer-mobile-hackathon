import { router, useIsFocused } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';

import { LiveEqualizer } from '@/components/now/playback-readout';
import { AppText, CoverArt, Icon, PillButton, PressableScale } from '@/components/ui';
import { formatTemperature, type SensingApi, type SessionApi, type SetupStep } from '@/lib/score';
import { colors, radius, sizes, space } from '@/theme';

import { DemoSheet } from './demo-sheet';
import { BUTTON_SIZE, Instrument, type InstrumentPhase } from './instrument';
import { Rise } from './motion';
import {
  calendarClause,
  paceClause,
  placeClause,
  songClause,
  timeClause,
  weatherClause,
  type Part,
} from './passage';
import { PassageView, type PassageLine } from './passage-view';

/** How long the finished reading stays on screen before the app moves to Now. */
const HANDOFF_MS = 900;
const HEADER_HEIGHT = 28;
const HEADLINE_HEIGHT = 76;
const COMPACT_BELOW = 720;

type Props = {
  sensing: SensingApi;
  session: SessionApi;
};

type StepId = SetupStep['id'];

/** The clauses of the living paragraph, once the scene is set. */
const LIVING: readonly StepId[] = ['place', 'weather', 'time', 'calendar', 'pace'];

/**
 * The Scene screen, in its three states:
 *
 * - at rest: the wordmark, one line, and the large "Set the scene" button with
 *   the figure settling around it;
 * - reading the moment: the button draws in and a short passage composes
 *   itself under it, a clause for each of the engine's steps: an unfinished
 *   phrase while the step works, the finished clause when it resolves, and
 *   the first song as the payoff. Then the app moves to Now by itself;
 * - set: the same passage as a living paragraph that rewrites a clause when
 *   that part of the context changes, the song that is playing, and a control
 *   to read the moment again.
 *
 * The clauses keep their identity across the last two states, so the reading
 * turns into the paragraph without anything being redrawn.
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
  const stageHeight = phase === 'rest' ? restHeight : phase === 'reading' ? (compact ? 132 : 210) : 0;

  const done = setup.steps.filter((step) => step.status === 'done').length;
  const targetEnergy = setup.scene?.energy ?? 0.5;
  const figureEnergy = reading ? 0.1 + (done / Math.max(1, setup.steps.length)) * targetEnergy : 0.1;

  // The moment, from the live values. A clause is written once its step has
  // resolved, and rewritten whenever that part of the context changes.
  const { context, location, occasion } = sensing;
  const clauses: Record<StepId, Part[]> = {
    place: placeClause(location, { setting: context.setting, placeName: context.placeName }),
    weather: weatherClause(
      context.weather,
      typeof context.temperatureC === 'number' ? formatTemperature(context.temperatureC).value : null,
      context.localHour
    ),
    time: timeClause(new Date().getDay(), context.localHour),
    calendar: calendarClause(occasion),
    pace: paceClause(context.cadenceSpm, context.setting),
    music: songClause(
      session.track?.title ?? setup.steps.find((step) => step.id === 'music')?.detail?.split(' · ')[0]
    ),
  };
  // Place, weather and time are a sentence each; the calendar and the pace
  // share one; the first song stands apart as the payoff.
  const apart = (id: StepId) => id === 'calendar' || id === 'music';
  const lines: PassageLine[] = reading
    ? setup.steps
        .filter((step) => step.status !== 'waiting')
        .map((step) => ({
          id: step.id,
          working: step.status === 'working' ? step.title : null,
          parts: step.status === 'done' ? clauses[step.id] : null,
          apart: apart(step.id),
        }))
    : isSet
      ? LIVING.map((id) => ({ id, working: null, parts: clauses[id], apart: apart(id) }))
      : [];

  const { track } = session;
  const sessionActive = session.status !== 'idle';

  return (
    <View onLayout={onLayout} style={styles.root}>
      <Rise style={styles.header}>
        <AppText accessibilityRole="header" variant="wordmark">
          Rubato
        </AppText>
      </Rise>

      {phase === 'rest' ? (
        <View style={styles.headline}>
          <Rise delay={140} key={failed ? 'failed' : 'rest'}>
            <AppText adjustsFontSizeToFit minimumFontScale={0.85} numberOfLines={2} variant="screenTitle">
              {failed ? 'That didn’t come together.' : 'What does right now sound like?'}
            </AppText>
          </Rise>
        </View>
      ) : null}

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
            {setup.error ?? 'Rubato couldn’t read the moment just now.'}
          </AppText>
          <PillButton label="Try again" onPress={beginSetup} size="sm" testID="scene-retry" />
        </Rise>
      ) : null}

      {lines.length > 0 ? <PassageView compact={compact} lines={lines} /> : null}

      {isSet ? (
        <Rise delay={120} style={styles.note}>
          <AppText tone="muted" variant="meta">
            {sessionActive
              ? 'Rubato keeps listening, and the music follows as this changes.'
              : 'The music has stopped. Set the scene again to bring it back.'}
          </AppText>
        </Rise>
      ) : null}

      {isSet ? (
        <Rise delay={200} style={styles.after}>
          {sessionActive ? (
            <PressableScale
              accessibilityLabel={
                track
                  ? `${session.status === 'paused' ? 'Paused' : 'Now playing'}: ${track.title} by ${track.artist}. Open Now.`
                  : 'Open Now'
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
                    {!track ? 'Starting the music' : session.status === 'paused' ? 'Paused' : 'Now playing'}
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
  note: {
    marginTop: space.xs,
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
