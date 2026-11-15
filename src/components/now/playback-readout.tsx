import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { NowCover } from '@/components/figure/now-cover';
import { crossFadeStyle, useCrossFade } from '@/components/scene/motion';
import { AppText, EqualizerBars, ProgressBar } from '@/components/ui';
import { albumInk, INK_MUTED } from '@/lib/album-ink';
import { usePlaybackProgress } from '@/lib/score';
import { space } from '@/theme';

import { formatMs } from './format';

type ReadoutProps = {
  /** Raw cover colour of the playing song; the fill is drawn in its album ink. */
  coverColor?: string | null;
  /** Nothing is audible yet because the first cue is still on its way. */
  waiting: boolean;
  /** The user has paused the song. */
  paused: boolean;
};

/**
 * The visible proof of playback: a thin progress line in the album's ink, with
 * the elapsed time, the state in a word and the total under it. This and the
 * two wrappers below are the only parts of the app's Now and Scene screens
 * that subscribe to `usePlaybackProgress()`, so they alone re-render four
 * times a second.
 */
export function PlaybackReadout({ coverColor, waiting, paused }: ReadoutProps) {
  const { positionMs, durationMs, isPlaying } = usePlaybackProgress();
  const elapsed = formatMs(positionMs);
  const total = formatMs(durationMs);
  const state = paused ? 'Paused' : isPlaying ? 'Playing' : waiting ? 'Loading' : 'Paused';
  // The word changes with a short cross-fade rather than a cut.
  const reduceMotion = useReducedMotion();
  const word = useCrossFade(state, state);

  return (
    <View
      accessibilityLabel={`${state}, ${elapsed} of ${total}`}
      accessible
      style={styles.readout}
      testID="now-progress">
      <ProgressBar
        tint={albumInk(coverColor, INK_MUTED)}
        value={durationMs > 0 ? positionMs / durationMs : 0}
      />
      <View style={styles.times}>
        <AppText style={styles.time} tone="muted" variant="time">
          {elapsed}
        </AppText>
        <Animated.View style={[styles.state, crossFadeStyle(word.visible, reduceMotion)]}>
          <AppText align="center" numberOfLines={1} tone="muted" variant="time">
            {word.value}
          </AppText>
        </Animated.View>
        <AppText align="right" style={styles.time} tone="muted" variant="time">
          {total}
        </AppText>
      </View>
    </View>
  );
}

type FigureCoverProps = {
  coverUrl: string | null;
  coverColor?: string | null;
  energy: number;
  bpm: number;
  trackId: number | null;
  width: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * The cover with the cymatic figure around it. The figure moves only while
 * audio is really playing, so the playback clock is read here rather than in
 * the screen.
 */
export function FigureCover(props: FigureCoverProps) {
  const { isPlaying } = usePlaybackProgress();
  return <NowCover {...props} playing={isPlaying} />;
}

/** Small equalizer for strips and banners, tied to the real playback state. */
export function LiveEqualizer({ size = 14 }: { size?: number }) {
  const { isPlaying } = usePlaybackProgress();
  return <EqualizerBars playing={isPlaying} size={size} />;
}

const styles = StyleSheet.create({
  readout: {
    gap: space.sm,
  },
  times: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  time: {
    minWidth: 32,
  },
  state: {
    flex: 1,
  },
});
