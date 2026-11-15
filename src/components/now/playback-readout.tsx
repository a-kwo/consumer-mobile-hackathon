import { StyleSheet, View } from 'react-native';

import { AppText, CoverArt, EqualizerBars, ProgressBar } from '@/components/ui';
import { usePlaybackProgress } from '@/lib/score';
import { motion, space } from '@/theme';

import { formatMs } from './format';

/**
 * The visible proof of playback: equalizer bars, elapsed time, a thin progress
 * line and the total. This is the only part of the Now screen that subscribes
 * to `usePlaybackProgress()`, so it alone re-renders four times a second.
 */
export function PlaybackReadout() {
  const { positionMs, durationMs, isPlaying } = usePlaybackProgress();
  const elapsed = formatMs(positionMs);
  const total = formatMs(durationMs);

  return (
    <View
      accessibilityLabel={`${isPlaying ? 'Playing' : 'Not playing'}, ${elapsed} of ${total}`}
      accessible
      style={styles.row}
      testID="now-progress">
      <EqualizerBars playing={isPlaying} size={14} />
      <AppText style={styles.time} tone="secondary" variant="numeric">
        {elapsed}
      </AppText>
      <ProgressBar
        style={styles.bar}
        tone={isPlaying ? 'accent' : 'neutral'}
        value={durationMs > 0 ? positionMs / durationMs : 0}
      />
      <AppText align="right" style={styles.time} tone="tertiary" variant="numeric">
        {total}
      </AppText>
    </View>
  );
}

type PulsingCoverProps = {
  uri: string | null;
  bpm: number | null;
  size: number;
  accessibilityLabel: string;
};

/**
 * The hero cover. It breathes at the song's tempo only while audio is really
 * playing, so it reads the playback clock here rather than in the screen.
 */
export function PulsingCover({ uri, bpm, size, accessibilityLabel }: PulsingCoverProps) {
  const { isPlaying } = usePlaybackProgress();
  return (
    <CoverArt
      accessibilityLabel={accessibilityLabel}
      bpm={bpm}
      pulsing={isPlaying}
      size={size}
      transitionMs={motion.duration.ambient}
      uri={uri}
    />
  );
}

/** Small equalizer for strips and banners, tied to the real playback state. */
export function LiveEqualizer({ size = 14 }: { size?: number }) {
  const { isPlaying } = usePlaybackProgress();
  return <EqualizerBars playing={isPlaying} size={size} />;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm + 2,
    height: 20,
  },
  time: {
    minWidth: 32,
  },
  bar: {
    flex: 1,
    alignSelf: 'center',
  },
});
