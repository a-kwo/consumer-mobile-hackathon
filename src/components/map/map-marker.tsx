import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  css,
  useAnimatedStyle,
  useReducedMotion,
  type SharedValue,
} from 'react-native-reanimated';

import { AppText, EqualizerBars, haptics } from '@/components/ui';
import { colors, fonts, motion, shadows } from '@/theme';

import type { MapPoint } from './projection';

export type MapMarkerProps = {
  /** True position on the map, in map points. */
  point: MapPoint;
  /** Where the avatar is drawn at world scale when neighbours crowd it, as an offset in map points. */
  offset: MapPoint;
  /** The map's zoom. The marker keeps its size on screen whatever this is. */
  scale: SharedValue<number>;
  emoji: string;
  name: string;
  /** Second line under the name while selected: the city. */
  detail?: string;
  /** Colour of the ring: the friend's album ink. */
  tint?: string;
  selected?: boolean;
  /** Lift the avatar this many points above its position, to sit on top of the day's route. */
  lift?: number;
  /** Their soundtrack changed within the hour: the ring pulses gently. */
  recent?: boolean;
  /** Their soundtrack is the one being replayed. */
  playing?: boolean;
  onPress: () => void;
  testID: string;
};

const SIZE = 30;
const SELECTED_SIZE = 40;

const pulse = css.keyframes({
  '0%': { transform: [{ scale: 1 }], opacity: 0.5 },
  '70%': { transform: [{ scale: 1.9 }], opacity: 0 },
  '100%': { transform: [{ scale: 1.9 }], opacity: 0 },
});

/**
 * A friend on the map: their emoji in a paper circle with an ink ring, their
 * name underneath, and a grain of ink on the exact spot. The whole marker
 * holds its size while the map zooms. At world scale it may sit a little off
 * its spot so neighbours stay visible; a hairline ties it back, and it slides
 * home as the map zooms in.
 */
export function MapMarker({
  point,
  offset,
  scale,
  emoji,
  name,
  detail,
  tint = colors.ink,
  selected = false,
  lift = 0,
  recent = false,
  playing = false,
  onPress,
  testID,
}: MapMarkerProps) {
  const reduceMotion = useReducedMotion();
  const size = selected ? SELECTED_SIZE : SIZE;
  const reach = Math.hypot(offset.x, offset.y);
  const angle = Math.atan2(offset.y, offset.x);

  // Hold a constant size on screen: undo the map's zoom.
  const anchor = useAnimatedStyle(() => ({ transform: [{ scale: 1 / scale.get() }] }));
  // The crowding offset (in points on screen) fades out between 1x and 2.5x zoom.
  const tether = useAnimatedStyle(() => {
    const zoom = scale.get();
    const keep = Math.max(0, Math.min(1, (2.5 - zoom) / 1.5));
    return { transform: [{ rotate: `${angle}rad` }, { scaleX: keep }] };
  });
  const body = useAnimatedStyle(() => {
    const zoom = scale.get();
    const keep = Math.max(0, Math.min(1, (2.5 - zoom) / 1.5));
    return {
      transform: [{ translateX: offset.x * keep }, { translateY: offset.y * keep }],
    };
  });

  return (
    <Animated.View
      style={[styles.anchor, { left: point.x, top: point.y, zIndex: selected ? 3 : 1 }, anchor]}>
      {reach > 4 ? (
        <Animated.View style={[styles.tether, { width: reach }, tether]} />
      ) : null}
      {/* Under the day's route the exact spot is the route's own centre. */}
      {lift > 0 ? null : <View style={styles.spot} />}
      <Animated.View style={[styles.body, body]}>
        <Animated.View
          style={{
            alignItems: 'center',
            transform: [{ translateY: -lift }],
            transitionProperty: 'transform',
            transitionDuration: reduceMotion ? 0 : motion.duration.slow,
            transitionTimingFunction: motion.easing.standard,
          }}>
          <Pressable
            accessibilityHint="Shows their day on the map"
            accessibilityLabel={`${name}${detail ? `, ${detail}` : ''}`}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            hitSlop={8}
            onPress={() => {
              haptics.select();
              onPress();
            }}
            style={styles.press}
            testID={testID}>
            <View style={{ width: size, height: size }}>
              {recent && !reduceMotion ? (
                <Animated.View
                  style={[
                    styles.halo,
                    {
                      borderRadius: size / 2,
                      borderColor: tint,
                      animationName: pulse,
                      animationDuration: 2400,
                      animationIterationCount: 'infinite',
                      animationTimingFunction: 'ease-out',
                    },
                  ]}
                />
              ) : null}
              <View
                style={[
                  styles.avatar,
                  { borderRadius: size / 2, borderColor: tint, borderWidth: selected ? 2 : 1.5 },
                ]}>
                <Text
                  allowFontScaling={false}
                  style={[styles.emoji, { fontSize: size * 0.5, lineHeight: size * 0.66 }]}>
                  {emoji}
                </Text>
              </View>
              {playing ? (
                <View style={styles.playing}>
                  <EqualizerBars bars={3} playing size={9} tint={tint} />
                </View>
              ) : null}
            </View>
            {/* Lifted above the route there is no room for words; the card below names them. */}
            <View style={[styles.label, lift > 0 ? styles.hidden : null]}>
              <AppText
                allowFontScaling={false}
                numberOfLines={1}
                style={[styles.name, selected ? styles.nameSelected : null]}>
                {name}
              </AppText>
              {selected && detail ? (
                <AppText allowFontScaling={false} numberOfLines={1} style={styles.detail}>
                  {detail}
                </AppText>
              ) : null}
            </View>
          </Pressable>
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

/** Your own position: a solid grain of ink with a paper edge, and "You". */
export function MeMarker({
  point,
  scale,
  label,
}: {
  point: MapPoint;
  scale: SharedValue<number>;
  label: string;
}) {
  const anchor = useAnimatedStyle(() => ({ transform: [{ scale: 1 / scale.get() }] }));
  return (
    <Animated.View
      accessibilityLabel={`You${label ? `, ${label}` : ''}`}
      accessible
      style={[styles.anchor, { left: point.x, top: point.y, zIndex: 0 }, anchor]}
      testID="feed-marker-me">
      <View style={styles.body}>
        <View style={styles.me} />
      </View>
      <View style={styles.meLabel}>
        <AppText allowFontScaling={false} numberOfLines={1} style={styles.name}>
          You
        </AppText>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // A zero-size box on the exact spot; everything is drawn around it.
  anchor: {
    position: 'absolute',
    width: 0,
    height: 0,
  },
  spot: {
    position: 'absolute',
    left: -2,
    top: -2,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.ink,
  },
  tether: {
    position: 'absolute',
    left: 0,
    top: -0.5,
    height: 1,
    backgroundColor: colors.inkMuted,
    transformOrigin: 'left center',
  },
  // Zero-size and centred: whatever it holds is centred on the spot.
  body: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  press: {
    alignItems: 'center',
  },
  halo: {
    ...StyleSheet.absoluteFill,
    borderWidth: 1.5,
  },
  avatar: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.paperRaised,
    ...shadows.raised,
  },
  emoji: {
    textAlign: 'center',
    includeFontPadding: false,
    color: colors.ink,
  },
  playing: {
    position: 'absolute',
    right: -7,
    top: -5,
    paddingHorizontal: 3,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: colors.paperRaised,
  },
  // The label hangs under the avatar without moving it off its spot.
  label: {
    position: 'absolute',
    top: '100%',
    marginTop: 2,
    width: 110,
    alignItems: 'center',
  },
  hidden: {
    opacity: 0,
  },
  name: {
    fontFamily: fonts.sansMedium,
    fontSize: 11,
    lineHeight: 14,
    color: colors.ink,
    textAlign: 'center',
  },
  nameSelected: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 13,
    lineHeight: 16,
  },
  detail: {
    fontFamily: fonts.sans,
    fontSize: 11,
    lineHeight: 14,
    color: colors.inkMuted,
    textAlign: 'center',
  },
  me: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2.5,
    borderColor: colors.paperRaised,
    backgroundColor: colors.ink,
    ...shadows.raised,
  },
  meLabel: {
    position: 'absolute',
    top: 8,
    left: -30,
    width: 60,
    alignItems: 'center',
  },
});
