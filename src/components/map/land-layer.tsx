import { Platform, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { colors } from '@/theme';

import { MAP_ASPECT, dotPitch, landPath } from './projection';

/**
 * On native a view is drawn once into a bitmap and the zoom scales that
 * bitmap, so the land is drawn at this multiple of its size and scaled down:
 * zoomed in, the grains stay round instead of going soft. The browser redraws
 * vectors at any scale, so it needs no oversampling.
 */
const OVERSAMPLE = Platform.OS === 'web' ? 1 : 3;

/**
 * The world's land as fine ink grains, on a map `width` points wide. It fills
 * a box of `width` by `width / MAP_ASPECT` and takes no touches.
 */
export function LandLayer({ width }: { width: number }) {
  const height = width / MAP_ASPECT;
  const drawn = width * OVERSAMPLE;

  return (
    <View style={[styles.box, { width, height }]}>
      <View
        style={{
          width: drawn,
          height: drawn / MAP_ASPECT,
          transformOrigin: 'left top',
          transform: [{ scale: 1 / OVERSAMPLE }],
        }}>
        <Svg height={drawn / MAP_ASPECT} viewBox={`0 0 ${width} ${height}`} width={drawn}>
          <Path
            d={landPath(width)}
            fill="none"
            stroke={colors.inkFaint}
            strokeLinecap="round"
            strokeWidth={dotPitch(width) * 0.5}
          />
        </Svg>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    position: 'absolute',
    left: 0,
    top: 0,
    overflow: 'hidden',
    pointerEvents: 'none',
  },
});
