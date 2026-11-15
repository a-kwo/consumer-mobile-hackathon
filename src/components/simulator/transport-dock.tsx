import { StyleSheet, View } from 'react-native';

import { AppText, CoverArt, IconButton, PrimaryButton, ProgressBar } from '@/components/ui';
import { sceneSentence } from '@/components/now/format';
import { LiveEqualizer } from '@/components/now/playback-readout';
import { usePlaybackProgress, type Scene, type SessionApi } from '@/lib/score';
import { albumInk, INK_MUTED } from '@/lib/album-ink';
import { colors, layout, motion, space } from '@/theme';

import { TUNING } from '../../../convex/tuning';

type Props = {
  session: SessionApi;
  /** `useSensing().scene`: the scene the controls describe right now. */
  previewScene: Scene;
  /** Space taken by the tab bar and home indicator under the dock. */
  bottomInset: number;
};

/** The thin line along the top edge of the dock. Re-renders with the playback clock. */
function DockProgress({ coverColor }: { coverColor?: string | null }) {
  const { positionMs, durationMs } = usePlaybackProgress();
  return (
    <ProgressBar
      accessibilityLabel="Cue progress"
      tint={albumInk(coverColor, INK_MUTED)}
      value={durationMs > 0 ? positionMs / durationMs : 0}
    />
  );
}

/**
 * What the dock says above the song title. While a song plays it compares the
 * scene on the controls with the scene the song was picked for, using the same
 * threshold as the engine, so the presenter can see a change coming before the
 * song actually switches.
 */
function statusLine(session: SessionApi, previewScene: Scene): { text: string; changing: boolean } {
  if (session.status === 'starting' || !session.track || !session.scene) {
    return { text: 'Finding the first cue', changing: false };
  }
  // The engine measures the gap with the nudge the song was picked with, which
  // is not public. Within one scene key the context alone can never move the
  // target energy past the threshold, so a gap with an unchanged key is only a
  // nudge starting or wearing off, and no early change will follow.
  const moved =
    previewScene.key !== session.scene.key &&
    Math.abs(previewScene.energy - session.scene.energy) > TUNING.playback.energyDelta;
  if (moved) {
    return {
      text: session.isLoadingNext ? 'Scene changed · cueing a new song' : 'Scene changed · new cue in seconds',
      changing: true,
    };
  }
  if (previewScene.key !== session.scene.key) {
    return { text: 'New scene · applies to the next cue', changing: false };
  }
  return { text: `Now playing · ${Math.round(session.track.bpm)} BPM`, changing: false };
}

/**
 * The bar docked above the tab bar on the Scene screen: the song that is
 * playing (cover, title, equalizer, progress) with stop and skip, or the start
 * control when nothing is playing. It stays put while the screen scrolls, so
 * a song change is always visible next to the control that caused it.
 */
export function TransportDock({ session, previewScene, bottomInset }: Props) {
  const active = session.status !== 'idle';
  const { track } = session;
  const status = statusLine(session, previewScene);

  return (
    <View style={[styles.dock, { paddingBottom: bottomInset + space.md }]} testID="sim-dock">
      {active ? <DockProgress coverColor={track?.coverColor} /> : <View style={styles.edge} />}
      {active ? (
        <View style={styles.active}>
          <View style={styles.status}>
            <LiveEqualizer size={11} />
            <AppText
              numberOfLines={1}
              style={styles.shrink}
              testID="sim-now-status"
              tone={status.changing ? 'primary' : 'muted'}
              variant="meta">
              {status.text}
            </AppText>
          </View>
          <View style={styles.row}>
            <CoverArt
              size={48}
              transitionMs={motion.duration.slow}
              uri={track?.coverUrl ?? null}
            />
            <View style={styles.text}>
              <AppText numberOfLines={1} testID="sim-now-title" variant="button">
                {track ? track.title : 'Finding your first cue…'}
              </AppText>
              <AppText numberOfLines={1} testID="sim-now-artist" tone="muted" variant="meta">
                {track ? track.artist : sceneSentence(previewScene)}
              </AppText>
            </View>
            <IconButton
              accessibilityLabel="Skip this cue"
              disabled={session.status !== 'playing'}
              icon="play-skip-forward"
              onPress={session.skip}
              testID="sim-skip"
            />
            <PrimaryButton
              accessibilityLabel="Stop scoring"
              icon="stop"
              onPress={session.stop}
              size="md"
              testID="sim-stop"
            />
          </View>
        </View>
      ) : (
        <View style={[styles.row, styles.idle]}>
          <View style={styles.text}>
            <AppText numberOfLines={1} variant="button">
              Ready to score
            </AppText>
            <AppText numberOfLines={2} tone="muted" variant="meta">
              {sceneSentence(previewScene)}
            </AppText>
          </View>
          <PrimaryButton
            accessibilityLabel="Start scoring"
            icon="play"
            label="Start"
            onPress={session.start}
            size="md"
            testID="sim-start"
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  dock: {
    backgroundColor: colors.paper,
  },
  edge: {
    height: layout.hairline,
    backgroundColor: colors.hairline,
  },
  active: {
    gap: space.sm,
    paddingTop: space.md,
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: layout.screenPadding,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 60,
    paddingHorizontal: layout.screenPadding,
  },
  idle: {
    paddingTop: space.md,
  },
  text: {
    flex: 1,
    gap: space.xxs,
  },
  shrink: {
    flexShrink: 1,
  },
});
