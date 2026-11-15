import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';

import { AppText } from '@/components/ui';
import { colors, fonts, inkAlpha, paperAlpha } from '@/theme';

import type { Stop } from './places';
import { layoutRoute } from './projection';

/** Radius of the close-up, in points on screen. */
export const DAY_PATH_RADIUS = 66;
const POINT = 16;

export type DayPathProps = {
  stops: readonly Stop[];
  /** Tracklist index of the track being replayed, to fill its point in. */
  activeIndex?: number | null;
  /** Colour of the route line and the active point: the friend's album ink. */
  tint?: string;
  testID?: string;
};

/**
 * A day's stops as a small route: numbered ink points joined in order by a
 * faint line, on a disc of paper that clears the map's grains underneath. It
 * is a close-up with its own scale, centred on the stops, north up. The view
 * is `2 * DAY_PATH_RADIUS` square; centre it on the friend's position.
 */
export function DayPath({ stops, activeIndex = null, tint = colors.inkMuted, testID }: DayPathProps) {
  const size = DAY_PATH_RADIUS * 2;
  const points = layoutRoute(stops, DAY_PATH_RADIUS - POINT);
  const line = points
    .map((point) => `${(point.x + DAY_PATH_RADIUS).toFixed(1)},${(point.y + DAY_PATH_RADIUS).toFixed(1)}`)
    .join(' ');

  return (
    <View
      accessibilityLabel={`The day's route: ${stops.length} ${stops.length === 1 ? 'stop' : 'stops'}`}
      accessibilityRole="image"
      accessible
      style={{ width: size, height: size }}
      testID={testID}>
      <Svg height={size} style={StyleSheet.absoluteFill} width={size}>
        <Circle
          cx={DAY_PATH_RADIUS}
          cy={DAY_PATH_RADIUS}
          fill={paperAlpha(0.9)}
          r={DAY_PATH_RADIUS - 0.5}
          stroke={colors.hairline}
          strokeWidth={1}
        />
        {points.length > 1 ? (
          <Polyline
            fill="none"
            points={line}
            stroke={tint}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeOpacity={0.55}
            strokeWidth={1.25}
          />
        ) : null}
      </Svg>
      {points.map((point, order) => {
        const stop = stops[order];
        const active = stop.index === activeIndex;
        return (
          <View
            key={stop.entry.playId}
            style={[
              styles.point,
              {
                left: point.x + DAY_PATH_RADIUS - POINT / 2,
                top: point.y + DAY_PATH_RADIUS - POINT / 2,
              },
              active ? { backgroundColor: colors.ink, borderColor: colors.ink } : null,
            ]}
            testID={testID ? `${testID}-stop-${stop.index + 1}` : undefined}>
            <AppText
              allowFontScaling={false}
              style={[styles.number, active ? styles.numberActive : null]}>
              {stop.index + 1}
            </AppText>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  point: {
    position: 'absolute',
    width: POINT,
    height: POINT,
    borderRadius: POINT / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: inkAlpha(0.55),
    backgroundColor: colors.paperRaised,
  },
  number: {
    fontFamily: fonts.sansMedium,
    fontSize: 9,
    lineHeight: 12,
    color: colors.ink,
    fontVariant: ['tabular-nums'],
  },
  numberActive: {
    color: colors.paper,
  },
});
