import { Image } from 'expo-image';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppText, CoverArt, EqualizerBars, IconButton } from '@/components/ui';
import { albumInk, INK_MUTED } from '@/lib/album-ink';
import type { OstEntry } from '@/lib/score';
import { colors, motion, radius, sizes, space } from '@/theme';

export type CueRowState = 'idle' | 'loading' | 'playing';

export type CueRowProps = {
  entry: OstEntry;
  /** Position in the tracklist, from 0. */
  index: number;
  /** `loading` and `playing` mark the row the replay is on. */
  state: CueRowState;
  /** Called by the replay button with the row's index. */
  onPress: (index: number) => void;
  /** Goes on the replay button, the row's one control. */
  testID: string;
};

/** Left inset that lines a divider up with the row's text. */
export const CUE_TEXT_INSET = sizes.thumb + space.md;

/**
 * One track of a soundtrack: its cover, the generated title in Fraunces,
 * "Song · Artist" underneath, the photo taken during it when there is one,
 * and a replay button. The row itself is not
 * pressable; the button is. While the replay is on this row the button
 * becomes Stop and the equalizer shows beside it in the song's album ink.
 */
export function CueRow({ entry, index, state, onPress, testID }: CueRowProps) {
  const active = state !== 'idle';

  return (
    <View style={styles.row}>
      <CoverArt recyclingKey={entry.playId} size={sizes.thumb} uri={entry.coverUrl} />
      <View style={styles.text}>
        <AppText numberOfLines={2} variant="entryTitle">
          {entry.title}
        </AppText>
        <AppText numberOfLines={1} variant="meta">
          {entry.songTitle} · {entry.artist}
        </AppText>
      </View>
      {entry.photoUrl ? (
        <Image
          accessibilityLabel="Photo taken during this track"
          accessible
          cachePolicy="memory-disk"
          contentFit="cover"
          recyclingKey={entry.playId}
          source={entry.photoUrl}
          style={styles.photo}
          testID={`${testID}-photo`}
          transition={motion.duration.base}
        />
      ) : null}
      {state === 'loading' ? (
        <ActivityIndicator accessibilityLabel="Loading" color={colors.inkMuted} size="small" />
      ) : state === 'playing' ? (
        <EqualizerBars playing size={14} tint={albumInk(entry.coverColor, INK_MUTED)} />
      ) : null}
      <IconButton
        accessibilityLabel={
          active
            ? `Stop replaying ${entry.title}`
            : `Replay from track ${index + 1}, ${entry.title}. ${entry.songTitle} by ${entry.artist}`
        }
        icon={active ? 'stop' : 'play'}
        onPress={() => onPress(index)}
        selected={active}
        size="sm"
        testID={testID}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 72,
    paddingVertical: space.md,
  },
  text: {
    flex: 1,
    gap: space.xxs,
  },
  photo: {
    width: 40,
    height: 40,
    borderRadius: radius.thumb,
    backgroundColor: colors.paperSunk,
  },
});
