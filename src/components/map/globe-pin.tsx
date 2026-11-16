import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import type { GlobeCamera, GlobeFrame } from './globe';
import { projectPlace } from './globe-math';

export type GlobePinProps = {
  lat: number;
  lon: number;
  frame: GlobeFrame;
  camera: GlobeCamera;
  /** Stacking order among pins. */
  zIndex?: number;
  children: ReactNode;
};

/**
 * Pins its children to a place on the globe: it is a zero-size origin moved
 * onto the place. Children position themselves around that origin with plain
 * offsets (it does no centring for them) and keep their size whatever the
 * zoom. As the place turns towards the edge they fade, and on the far side
 * they are gone (and cannot be tapped).
 */
export function GlobePin({ lat, lon, frame, camera, zIndex = 1, children }: GlobePinProps) {
  const { width, height, radius } = frame;

  const pinned = useAnimatedStyle(() => {
    const p = projectPlace(lat, lon, camera.lat.get(), camera.lon.get());
    const r = radius * camera.zoom.get();
    // Fully visible from a little inside the edge; nothing at all behind it.
    const visible = Math.max(0, Math.min(1, (p.z - 0.04) / 0.22));
    return {
      opacity: visible,
      transform: [
        { translateX: width / 2 + p.x * r },
        { translateY: height / 2 + camera.shiftY.get() - p.y * r },
        // A hidden pin shrinks to nothing, so it takes no touches.
        { scale: visible > 0 ? 1 : 0 },
      ],
    };
  });

  return <Animated.View style={[styles.pin, { zIndex }, pinned]}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  // A zero-size origin, moved onto the place.
  pin: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 0,
    height: 0,
  },
});
