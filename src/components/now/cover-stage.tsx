import { useState, type ReactNode } from 'react';
import { StyleSheet, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';

import { REF_HEIGHT, REF_WIDTH } from '@/components/figure/figure-tuning';

import { FigureCover } from './playback-readout';

/**
 * How far (at the 390-wide reference) the figure's box may reach past the
 * stage at the top and bottom. The figure has almost faded to paper there, so
 * the header and the scene line can sit over its outer edge and the cover gets
 * that much more room.
 */
const OVERLAP = 24;
const STAGE_REF_HEIGHT = REF_HEIGHT - OVERLAP * 2;

type Props = {
  coverUrl: string | null;
  coverColor?: string | null;
  /** 0 to 1: shapes the figure. */
  energy: number;
  bpm: number;
  /** A change scatters the grains. Null before the first song. */
  trackId: number | null;
  /** Drawn over the top of the stage (an error notice). */
  children?: ReactNode;
};

/**
 * The hero of the Now screen: the album cover with the cymatic figure around
 * it, sized to whatever height the rest of the screen leaves. On a tall phone
 * the figure spans the window; on a short one the cover shrinks with it.
 *
 * The figure's box is wider than the padded page and a little taller than this
 * stage by design, and overflows both equally. Nothing here clips it.
 */
export function CoverStage({ coverUrl, coverColor, energy, bpm, trackId, children }: Props) {
  const { width: windowWidth } = useWindowDimensions();
  const [height, setHeight] = useState(0);

  const onLayout = (event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.height);
    if (next !== height) setHeight(next);
  };
  const width =
    height > 0 ? Math.round(Math.min(windowWidth, (height * REF_WIDTH) / STAGE_REF_HEIGHT)) : 0;

  return (
    <View onLayout={onLayout} style={styles.stage}>
      {width > 0 ? (
        <FigureCover
          bpm={bpm}
          coverColor={coverColor}
          coverUrl={coverUrl}
          energy={energy}
          trackId={trackId}
          width={width}
        />
      ) : null}
      {children ? <View style={styles.overlay}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    flex: 1,
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
});
