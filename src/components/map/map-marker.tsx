import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  css,
  useAnimatedStyle,
  useReducedMotion,
  type SharedValue,
} from "react-native-reanimated";

import { AppText, EqualizerBars, haptics } from "@/components/ui";
import { colors, fonts, paperAlpha, shadows } from "@/theme";

export type MapMarkerProps = {
  /** Where the avatar is drawn when neighbours crowd it, as an offset in points on screen. */
  offset: { x: number; y: number };
  /** The globe's zoom: the crowding offset eases away as it grows. */
  zoom: SharedValue<number>;
  emoji: string;
  name: string;
  /** Second line under the name while selected: the city. */
  detail?: string;
  /** Colour of the ring: the friend's album ink. */
  tint?: string;
  selected?: boolean;
  /** Their soundtrack changed within the hour: the ring pulses gently. */
  recent?: boolean;
  /** Their soundtrack is the one being replayed. */
  playing?: boolean;
  onPress: () => void;
  testID: string;
};

const SIZE = 30;
const SELECTED_SIZE = 40;
/** Width of the column that holds the circle and the words under it. */
const COLUMN_WIDTH = 120;
/** Diameter of the "you" grain. */
const ME_SIZE = 12;

const pulse = css.keyframes({
  "0%": { transform: [{ scale: 1 }], opacity: 0.5 },
  "70%": { transform: [{ scale: 1.9 }], opacity: 0 },
  "100%": { transform: [{ scale: 1.9 }], opacity: 0 },
});

/**
 * A friend on the globe: their emoji in a paper circle with an ink ring, their
 * name underneath, and a grain of ink on the exact spot. Put it inside a
 * `GlobePin`. It may sit a little off its spot so neighbours stay visible; a
 * hairline ties it back, and it slides home as the globe zooms in.
 *
 * Layout: the pin gives a zero-size origin on the spot. The circle and the
 * words are an ordinary column (circle, then words underneath), placed with
 * plain numbers so that the centre of the circle is on the origin. Nothing is
 * positioned with a percentage: inside a zero-size parent, React Native
 * resolves a percentage offset to zero, which once put the words on top of
 * the circle on iOS and Android while the browser put them underneath.
 */
export function MapMarker({
  offset,
  zoom,
  emoji,
  name,
  detail,
  tint = colors.ink,
  selected = false,
  recent = false,
  playing = false,
  onPress,
  testID,
}: MapMarkerProps) {
  const reduceMotion = useReducedMotion();
  const size = selected ? SELECTED_SIZE : SIZE;
  const reach = Math.hypot(offset.x, offset.y);
  const angle = Math.atan2(offset.y, offset.x);

  // The crowding offset fades out between 1x and 2x zoom.
  const tether = useAnimatedStyle(() => {
    const keep = Math.max(0, Math.min(1, 2 - zoom.get()));
    return { transform: [{ rotate: `${angle}rad` }, { scaleX: keep }] };
  });
  const body = useAnimatedStyle(() => {
    const keep = Math.max(0, Math.min(1, 2 - zoom.get()));
    return {
      transform: [
        { translateX: offset.x * keep },
        { translateY: offset.y * keep },
      ],
    };
  });

  return (
    <View style={styles.anchor}>
      {reach > 4 ? (
        <Animated.View style={[styles.tether, { width: reach }, tether]} />
      ) : null}
      <View style={styles.spot} />
      <Animated.View style={[styles.body, body]}>
        {/* The column's top is half a circle above the origin, so the circle is centred on it. */}
        <View style={[styles.column, { top: -size / 2 }]}>
          <Pressable
            accessibilityHint="Shows their day on the map"
            accessibilityLabel={`${name}${detail ? `, ${detail}` : ""}`}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            hitSlop={8}
            onPress={() => {
              haptics.select();
              onPress();
            }}
            style={styles.press}
            testID={testID}
          >
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
                      animationIterationCount: "infinite",
                      animationTimingFunction: "ease-out",
                    },
                  ]}
                />
              ) : null}
              <View
                style={[
                  styles.avatar,
                  {
                    borderRadius: size / 2,
                    borderColor: tint,
                    borderWidth: selected ? 2 : 1.5,
                  },
                ]}
              >
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.emoji,
                    { fontSize: size * 0.5, lineHeight: size * 0.66 },
                  ]}
                >
                  {emoji}
                </Text>
              </View>
              {playing ? (
                <View style={styles.playing}>
                  <EqualizerBars bars={3} playing size={9} tint={tint} />
                </View>
              ) : null}
            </View>
            <View style={[styles.plate, styles.label]}>
                <AppText
                  allowFontScaling={false}
                  numberOfLines={1}
                  style={[styles.name, selected ? styles.nameSelected : null]}
                >
                  {name}
                </AppText>
                {selected && detail ? (
                  <AppText
                    allowFontScaling={false}
                    numberOfLines={1}
                    style={styles.detail}
                  >
                    {detail}
                  </AppText>
                ) : null}
            </View>
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
}

/** Your own position: a solid grain of ink with a paper edge, and "You". */
export function MeMarker({ label }: { label: string }) {
  return (
    <View
      accessibilityLabel={`You${label ? `, ${label}` : ""}`}
      accessible
      style={styles.anchor}
      testID="feed-marker-me"
    >
      <View style={styles.me} />
      <View style={styles.meColumn}>
        <View style={styles.plate}>
          <AppText
            allowFontScaling={false}
            numberOfLines={1}
            style={styles.name}
          >
            You
          </AppText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // A zero-size box on the exact spot; everything is drawn around it.
  anchor: {
    width: 0,
    height: 0,
  },
  spot: {
    position: "absolute",
    left: -2,
    top: -2,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.ink,
  },
  tether: {
    position: "absolute",
    left: 0,
    top: -0.5,
    height: 1,
    backgroundColor: colors.inkMuted,
    transformOrigin: "left center",
  },
  // A zero-size origin on the spot. It only carries the crowding offset.
  body: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 0,
    height: 0,
  },
  // A fixed-width column, centred on the origin from side to side.
  column: {
    position: "absolute",
    left: -COLUMN_WIDTH / 2,
    width: COLUMN_WIDTH,
    alignItems: "center",
  },
  // The circle, then the words under it.
  press: {
    alignItems: "center",
  },
  halo: {
    ...StyleSheet.absoluteFill,
    borderWidth: 1.5,
  },
  avatar: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.paperRaised,
    ...shadows.raised,
  },
  emoji: {
    textAlign: "center",
    includeFontPadding: false,
    color: colors.ink,
  },
  playing: {
    position: "absolute",
    right: -7,
    top: -5,
    paddingHorizontal: 3,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: colors.paperRaised,
  },
  // Under the circle, in normal flow.
  label: {
    marginTop: 2,
  },
  // A wash of paper behind the words, so the land's grains do not run through them.
  plate: {
    maxWidth: COLUMN_WIDTH,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 7,
    backgroundColor: paperAlpha(0.82),
    alignItems: "center",
  },
  name: {
    fontFamily: fonts.sansMedium,
    fontSize: 11,
    lineHeight: 14,
    color: colors.ink,
    textAlign: "center",
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
    textAlign: "center",
  },
  // Centred on the origin with plain offsets.
  me: {
    position: "absolute",
    left: -ME_SIZE / 2,
    top: -ME_SIZE / 2,
    width: ME_SIZE,
    height: ME_SIZE,
    borderRadius: ME_SIZE / 2,
    borderWidth: 2.5,
    borderColor: colors.paperRaised,
    backgroundColor: colors.ink,
    ...shadows.raised,
  },
  // The word hangs just under the grain.
  meColumn: {
    position: "absolute",
    top: ME_SIZE / 2 + 2,
    left: -COLUMN_WIDTH / 2,
    width: COLUMN_WIDTH,
    alignItems: "center",
  },
});
