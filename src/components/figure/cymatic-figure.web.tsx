/**
 * Web variant of `cymatic-figure.tsx`. Skia on the web needs CanvasKit loaded
 * before the module is imported, which this app does not set up, so the web
 * build draws no figure: an empty box of the same size. `NowCover` then shows
 * the cover alone. The props are the same and are ignored.
 */
import { View } from 'react-native';

import type { CymaticFigureProps } from './cymatic-figure';
import { REF_HEIGHT, REF_WIDTH } from './figure-tuning';

export type { CymaticFigureProps, FigureStats } from './cymatic-figure';

export function CymaticFigure({ width, height, style }: CymaticFigureProps) {
  return (
    <View
      style={[
        { width, height: height ?? Math.round((width * REF_HEIGHT) / REF_WIDTH), pointerEvents: 'none' },
        style,
      ]}
    />
  );
}
