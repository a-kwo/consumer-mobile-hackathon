import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppText, CoverArt, EqualizerBars, PressableScale } from '@/components/ui';
import type { OstEntry } from '@/lib/score';
import { colors, fonts, space } from '@/theme';

import { cueNumber, formatClock } from './format';

export type CueRowState = 'idle' | 'loading' | 'playing';

export type CueRowProps = {
  entry: OstEntry;
  /** Position in the tracklist, from 0. */
  index: number;
  /** `loading` and `playing` mark the row the replay is on. */
  state: CueRowState;
  onPress: (index: number) => void;
  testID: string;
};

export const CUE_COVER_SIZE = 48;
const NUMBER_WIDTH = 22;
/** Left inset that lines a divider up with the row's text. */
export const CUE_TEXT_INSET = NUMBER_WIDTH + space.sm + CUE_COVER_SIZE + space.md;

/**
 * One cue of a soundtrack: its number, cover, generated title in the serif,
 * the song underneath and the time it played. The row the replay is on turns
 * amber and shows the equalizer in place of the time.
 */
export function CueRow({ entry, index, state, onPress, testID }: CueRowProps) {
  const active = state !== 'idle';
  const number = cueNumber(index);
  const time = formatClock(entry.startedAt);

  return (
    <PressableScale
      accessibilityHint={active ? 'Stops the replay' : 'Replays from this cue'}
      accessibilityLabel={`Cue ${index + 1}, ${entry.title}. ${entry.songTitle} by ${entry.artist}${
        active ? ', playing' : ''
      }`}
      accessibilityState={{ selected: active }}
      containerStyle={styles.container}
      fill
      onPress={() => onPress(index)}
      pressedOpacity={0.6}
      scaleTo={0.985}
      style={styles.row}
      testID={testID}>
      <AppText
        style={styles.number}
        tone={active ? 'accent' : 'tertiary'}
        variant="numeric">
        {number}
      </AppText>
      <CoverArt
        recyclingKey={entry.playId}
        shadow={false}
        size={CUE_COVER_SIZE}
        uri={entry.coverUrl}
      />
      <View style={styles.text}>
        <AppText
          numberOfLines={2}
          style={styles.title}
          tone={active ? 'accent' : 'primary'}
          variant="displaySmall">
          {entry.title}
        </AppText>
        <AppText numberOfLines={1} variant="caption">
          {entry.songTitle} — {entry.artist}
        </AppText>
      </View>
      <View style={styles.trailing}>
        {state === 'loading' ? (
          <ActivityIndicator accessibilityLabel="Loading" color={colors.accent} size="small" />
        ) : state === 'playing' ? (
          <EqualizerBars playing size={16} />
        ) : (
          <AppText numberOfLines={1} tone="tertiary" variant="numeric">
            {time}
          </AppText>
        )}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'stretch',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 72,
    paddingVertical: space.md,
  },
  number: {
    width: NUMBER_WIDTH,
    marginRight: space.sm,
  },
  text: {
    flex: 1,
    gap: space.xxs,
    marginLeft: space.md,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 20,
    lineHeight: 24,
    letterSpacing: 0,
  },
  trailing: {
    minWidth: 58,
    marginLeft: space.sm,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
});
