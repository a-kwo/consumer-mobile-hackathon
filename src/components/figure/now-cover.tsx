/**
 * NowCover: the centrepiece of the Now screen. The cymatic figure, its fade
 * to paper, and the album cover, stacked in that order and centred (plan 5,
 * "Where it sits").
 *
 *   <NowCover
 *     coverUrl={track.coverUrl}
 *     coverColor={track.coverColor}   // raw hex from the backend, may be undefined
 *     energy={track.energy}           // 0 to 1
 *     bpm={track.bpm}
 *     playing={isPlaying}
 *     trackId={track.id}
 *   />
 *
 * Props
 *   coverUrl     Cover image. Missing: a raised-paper placeholder square.
 *   coverColor   Raw dominant colour of the cover. Converted to album ink here
 *                (`albumInk`), falling back to the muted ink when missing or grey.
 *   energy, bpm, playing, trackId   Passed to `CymaticFigure`.
 *   width        Width of the figure region. @default the window width
 *   paperColor   The screen background the figure fades into. @default '#F4EDE1'
 *   onStats      Passed to `CymaticFigure` (frame rate readout for the lab).
 *   style        Extra style for the outer box.
 *
 * Layout
 *   - The box is `width` wide and `width · 417 / 390` high, and centres itself.
 *     The figure is meant to span the full screen width, so inside a padded
 *     parent the box overflows the padding equally on both sides. Do not clip it.
 *   - Everything scales from the plan's 390-wide reference: at 390 the cover is
 *     272 square with radius 6, and the figure shows as a band around it.
 *   - The figure has faded to paper before the edge of the box, so text placed
 *     right under it may pull up with a negative top margin if the gap looks wide.
 *   - The frame loop stops by itself when this screen loses focus.
 *
 * For the progress bar's fill use the same colour:
 *   `albumInk(track.coverColor, INK_MUTED)` from `@/lib/album-ink`.
 */
import { Image } from 'expo-image';
import { useIsFocused } from 'expo-router';
import { StyleSheet, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';

import { albumInk, INK_MUTED } from '@/lib/album-ink';

import { CymaticFigure, type FigureStats } from './cymatic-figure';
import { COVER_RADIUS, COVER_SIZE, REF_HEIGHT, REF_WIDTH } from './figure-tuning';

export type NowCoverProps = {
  coverUrl?: string | null;
  coverColor?: string | null;
  energy: number;
  bpm: number;
  playing: boolean;
  trackId: string | number | null | undefined;
  width?: number;
  paperColor?: string;
  onStats?: (stats: FigureStats) => void;
  style?: StyleProp<ViewStyle>;
};

/** `paperRaised`: the placeholder cover. */
const PAPER_RAISED = '#FBF7EF';

export function NowCover({
  coverUrl,
  coverColor,
  energy,
  bpm,
  playing,
  trackId,
  width,
  paperColor = '#F4EDE1',
  onStats,
  style,
}: NowCoverProps) {
  const window = useWindowDimensions();
  const focused = useIsFocused();
  const boxWidth = width ?? window.width;
  const boxHeight = Math.round((boxWidth * REF_HEIGHT) / REF_WIDTH);
  const scale = boxWidth / REF_WIDTH;
  const coverSize = Math.round(COVER_SIZE * scale);
  const coverRadius = COVER_RADIUS * scale;
  const ink = albumInk(coverColor, INK_MUTED);

  return (
    <View style={[styles.box, { width: boxWidth, height: boxHeight }, style]}>
      <CymaticFigure
        active={focused}
        bpm={bpm}
        color={ink}
        energy={energy}
        height={boxHeight}
        onStats={onStats}
        paperColor={paperColor}
        playing={playing}
        style={styles.figure}
        trackId={trackId}
        width={boxWidth}
      />
      <View
        style={[
          styles.cover,
          {
            width: coverSize,
            height: coverSize,
            borderRadius: coverRadius,
            // The plan's two-layer warm shadow, scaled with the cover.
            boxShadow: [
              {
                offsetX: 0,
                offsetY: 22 * scale,
                blurRadius: 44 * scale,
                color: 'rgba(74, 52, 30, 0.18)',
              },
              {
                offsetX: 0,
                offsetY: 2 * scale,
                blurRadius: 6 * scale,
                color: 'rgba(74, 52, 30, 0.14)',
              },
            ],
          },
        ]}>
        {coverUrl ? (
          <Image
            accessibilityIgnoresInvertColors
            accessibilityLabel="Album cover"
            contentFit="cover"
            source={{ uri: coverUrl }}
            style={[styles.image, { borderRadius: coverRadius }]}
            transition={{ duration: 240, effect: 'cross-dissolve' }}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
  figure: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  cover: {
    backgroundColor: PAPER_RAISED,
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
