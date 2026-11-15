import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';

import { colors, radius, shadows } from '@/theme';

import { globeFrame, type GlobeCamera } from './globe';
import { GlobeCanvas } from './globe-canvas';
import { GlobePin } from './globe-pin';
import type { Place } from './places';

export type PlaceGlobeProps = {
  width: number;
  /** @default 148 */
  height?: number;
  /** The place the globe is turned to. */
  place: Place;
  /** Colour of the grain that marks the place: the friend's album ink. */
  tint?: string;
  testID?: string;
};

const ZOOM = 2.6;

/**
 * A still of the friends globe, turned to one place and seen close, with a
 * grain of ink on the spot. Nothing here moves or takes touches.
 */
export function PlaceGlobe({ width, height = 148, place, tint = colors.ink, testID }: PlaceGlobeProps) {
  const frame = useMemo(() => globeFrame(width, height, 0), [width, height]);
  const lat = useSharedValue(place.lat);
  const lon = useSharedValue(place.lon);
  const zoom = useSharedValue(ZOOM);
  const shiftY = useSharedValue(0);
  const camera: GlobeCamera = useMemo(() => ({ lat, lon, zoom, shiftY }), [lat, lon, zoom, shiftY]);

  useEffect(() => {
    lat.set(place.lat);
    lon.set(place.lon);
  }, [place.lat, place.lon, lat, lon]);

  return (
    <View
      accessibilityLabel={place.label ? `On the globe: ${place.label}` : 'On the globe'}
      accessibilityRole="image"
      accessible
      style={[styles.box, { width, height }]}
      testID={testID}>
      <GlobeCanvas camera={camera} frame={frame} />
      <GlobePin camera={camera} frame={frame} lat={place.lat} lon={place.lon}>
        <View style={[styles.spot, { backgroundColor: tint }]} />
      </GlobePin>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    overflow: 'hidden',
    borderRadius: radius.cover,
    backgroundColor: colors.paper,
  },
  spot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2.5,
    borderColor: colors.paperRaised,
    ...shadows.raised,
  },
});
