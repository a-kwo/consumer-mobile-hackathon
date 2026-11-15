import { StyleSheet, View } from 'react-native';

import { colors, radius } from '@/theme';

import { DAY_PATH_RADIUS, DayPath } from './day-path';
import { LandLayer } from './land-layer';
import type { Place, Stop } from './places';
import { project } from './projection';

export type DayMapProps = {
  /** Width of the frame, in points. */
  width: number;
  /** Where the day happened: the centre of the view. */
  place: Place;
  stops: readonly Stop[];
  /** Tracklist index of the track being replayed. */
  activeStopIndex?: number | null;
  tint?: string;
  testID?: string;
};

const ZOOM = 3.4;
const HEIGHT = DAY_PATH_RADIUS * 2 + 24;

/**
 * A still of the friends map, zoomed on one place, with the day's stops drawn
 * over it. Nothing here moves or takes touches.
 */
export function DayMap({ width, place, stops, activeStopIndex, tint, testID }: DayMapProps) {
  const point = project(place.lat, place.lon, width);
  // Put the place in the middle of the frame.
  const x = width / 2 - point.x * ZOOM;
  const y = HEIGHT / 2 - point.y * ZOOM;

  return (
    <View
      accessibilityLabel={`Map of the day${place.label ? ` in ${place.label}` : ''}`}
      accessibilityRole="image"
      accessible
      style={[styles.frame, { width, height: HEIGHT }]}
      testID={testID}>
      <View
        style={[
          styles.world,
          { transform: [{ translateX: x }, { translateY: y }, { scale: ZOOM }] },
        ]}>
        <LandLayer width={width} />
      </View>
      <View style={styles.route}>
        <DayPath
          activeIndex={activeStopIndex}
          stops={stops}
          testID={testID ? `${testID}-route` : undefined}
          tint={tint}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
    borderRadius: radius.cover,
    backgroundColor: colors.paperRaised,
  },
  world: {
    position: 'absolute',
    left: 0,
    top: 0,
    transformOrigin: 'left top',
    pointerEvents: 'none',
  },
  route: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
