import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { PanResponder, Platform, Pressable, StyleSheet, View } from 'react-native';
import {
  Easing,
  cancelAnimation,
  useReducedMotion,
  useSharedValue,
  withDecay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { PillButton } from '@/components/ui';
import { colors, space } from '@/theme';

import { globeFrame, type GlobeCamera } from './globe';
import { GlobeCanvas } from './globe-canvas';
import { shortestTurn, spreadPlaces } from './globe-math';
import { GlobePin } from './globe-pin';
import { MapMarker, MeMarker } from './map-marker';
import type { Place } from './places';

export type GlobeFriend = {
  /** Stable id: the friend's feed id. */
  id: string;
  place: Place;
  emoji: string;
  name: string;
  /** Ring colour: their album ink. */
  tint?: string;
  recent: boolean;
  playing: boolean;
  /** Goes on the marker's button. */
  testID: string;
};

export type FriendsGlobeProps = {
  width: number;
  height: number;
  friends: readonly GlobeFriend[];
  /** Your own position, when known. */
  me?: Place | null;
  /** The friend the globe is turned to, or null for the whole globe. */
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /**
   * How much of the bottom of the frame is covered while a friend is selected
   * (by the card), in points. The friend is centred in what is left.
   */
  coveredBottom?: number;
  testID?: string;
};

/** How close the globe comes to a selected friend, and the most a pinch can reach. */
const FOCUS_ZOOM = 1.8;
const MAX_ZOOM = 3.5;
const GLIDE_MS = 700;
/** The globe never tips further than this, so north stays up. */
const MAX_TILT = 72;
/** The latitude the whole-globe view rests at. */
const HOME_LAT = 18;
/** One idle turn of the globe takes this long. */
const IDLE_TURN_MS = 150_000;
/** Space a marker and its name need. */
const MARKER_GAP = { x: 44, y: 48 };

/**
 * The friends globe: the world as ink grains on a paper sphere, a marker
 * pinned at each friend's place, and a camera that turns to whoever is
 * selected and comes in close.
 *
 * Touch: drag to turn the globe (it coasts a little when let go), pinch to
 * zoom, tap a marker to turn to that friend. Tap the globe or "Whole world"
 * to come back out. On the web the mouse drags, and the wheel (or a trackpad
 * pinch) zooms. Until it is first touched the globe turns slowly by itself,
 * unless the system asks for reduced motion.
 */
export function FriendsGlobe({
  width,
  height,
  friends,
  me,
  selectedId,
  onSelect,
  coveredBottom = 0,
  testID,
}: FriendsGlobeProps) {
  const reduceMotion = useReducedMotion();
  const frame = useMemo(() => globeFrame(width, height), [width, height]);

  const selected = friends.find((friend) => friend.id === selectedId) ?? null;
  // Start facing the first friend's side of the world.
  const firstLon = friends[0]?.place.lon ?? -30;

  const lat = useSharedValue(HOME_LAT);
  const lon = useSharedValue(firstLon);
  const zoom = useSharedValue(1);
  const shiftY = useSharedValue(0);
  const camera: GlobeCamera = useMemo(() => ({ lat, lon, zoom, shiftY }), [lat, lon, zoom, shiftY]);

  // Where a gesture started from.
  const startLat = useSharedValue(0);
  const startLon = useSharedValue(0);
  const startZoom = useSharedValue(1);
  const startSpread = useSharedValue(0);
  const touchCount = useSharedValue(0);
  // When the last drag or pinch ended. In a browser the mouse-up that ends a
  // drag also clicks the globe, and that click must not zoom back out.
  const gestureEndedAt = useSharedValue(0);

  // The globe turns by itself only until someone touches it or picks a friend.
  const [idle, setIdle] = useState(true);
  if (idle && selectedId !== null) setIdle(false);
  // True once the user has zoomed in by hand, so the way back is offered.
  const [zoomedByHand, setZoomedByHand] = useState(false);

  // Until the feed arrives the globe faces a default; turn it to the friends once, if still untouched.
  const [facing, setFacing] = useState(firstLon);
  if (idle && facing !== firstLon) setFacing(firstLon);
  useEffect(() => {
    if (!idle) return;
    lon.set(facing);
    if (reduceMotion) return;
    lon.set(
      withRepeat(withTiming(facing + 360, { duration: IDLE_TURN_MS, easing: Easing.linear }), -1)
    );
    return () => cancelAnimation(lon);
  }, [idle, facing, reduceMotion, lon]);

  // Turn to the selected friend and come in close, or go back out to the whole globe.
  const focusLat = selected?.place.lat ?? null;
  const focusLon = selected?.place.lon ?? null;
  useEffect(() => {
    const timing = {
      duration: reduceMotion ? 0 : GLIDE_MS,
      easing: Easing.inOut(Easing.cubic),
    };
    if (focusLat === null || focusLon === null) {
      zoom.set(withTiming(1, timing));
      shiftY.set(withTiming(0, timing));
      lat.set(withTiming(HOME_LAT, timing));
      return;
    }
    const from = lon.get();
    lon.set(withTiming(from + shortestTurn(from, focusLon), timing));
    lat.set(withTiming(Math.max(-MAX_TILT, Math.min(MAX_TILT, focusLat)), timing));
    zoom.set(withTiming(FOCUS_ZOOM, timing));
    // Centre the friend in the part of the frame the card leaves free.
    shiftY.set(withTiming(-coveredBottom / 2, timing));
  }, [focusLat, focusLon, coveredBottom, reduceMotion, lat, lon, zoom, shiftY]);

  const backToWorld = () => {
    setZoomedByHand(false);
    if (selectedId !== null) {
      onSelect(null);
      return;
    }
    const timing = { duration: reduceMotion ? 0 : GLIDE_MS, easing: Easing.inOut(Easing.cubic) };
    zoom.set(withTiming(1, timing));
    lat.set(withTiming(HOME_LAT, timing));
  };

  // Drag and pinch. Plain touch handling on the JS thread: it only moves four
  // numbers, and it behaves the same on iOS, Android and the web.
  const responder = useMemo(() => {
    const radius = frame.radius;
    const rebase = (touches: readonly { pageX: number; pageY: number }[]) => {
      cancelAnimation(lat);
      cancelAnimation(lon);
      cancelAnimation(zoom);
      startLat.set(lat.get());
      startLon.set(lon.get());
      startZoom.set(zoom.get());
      startSpread.set(
        touches.length >= 2
          ? Math.hypot(touches[0].pageX - touches[1].pageX, touches[0].pageY - touches[1].pageY)
          : 0
      );
      touchCount.set(touches.length);
    };
    const wants = (touches: number, dx: number, dy: number) =>
      touches >= 2 || Math.hypot(dx, dy) > 6;
    /** Degrees the globe turns for one point of drag, at the current zoom. */
    const degreesPerPoint = () => 180 / Math.PI / (radius * zoom.get());
    const end = (vx: number, vy: number) => {
      touchCount.set(0);
      gestureEndedAt.set(clock());
      setZoomedByHand(zoom.get() > 1.05);
      if (reduceMotion) return;
      // Coast: PanResponder gives points per millisecond.
      const perSecond = degreesPerPoint() * 1000;
      lon.set(withDecay({ velocity: -vx * perSecond, deceleration: 0.994 }));
      lat.set(
        withDecay({ velocity: vy * perSecond, deceleration: 0.994, clamp: [-MAX_TILT, MAX_TILT] })
      );
    };

    return PanResponder.create({
      onMoveShouldSetPanResponder: (event, gesture) =>
        wants(event.nativeEvent.touches.length, gesture.dx, gesture.dy),
      onMoveShouldSetPanResponderCapture: (event, gesture) =>
        wants(event.nativeEvent.touches.length, gesture.dx, gesture.dy),
      onPanResponderGrant: (event) => {
        setIdle(false);
        rebase(event.nativeEvent.touches);
      },
      onPanResponderMove: (event, gesture) => {
        const touches = event.nativeEvent.touches;
        if (touches.length !== touchCount.get()) {
          // A finger came or went: carry on from where the globe is now.
          rebase(touches);
          const k = degreesPerPoint();
          startLon.set(lon.get() + gesture.dx * k);
          startLat.set(lat.get() - gesture.dy * k);
          return;
        }
        if (touches.length >= 2 && startSpread.get() > 0) {
          const spread = Math.hypot(
            touches[0].pageX - touches[1].pageX,
            touches[0].pageY - touches[1].pageY
          );
          zoom.set(
            Math.min(MAX_ZOOM, Math.max(1, (startZoom.get() * spread) / startSpread.get()))
          );
        }
        const k = degreesPerPoint();
        lon.set(startLon.get() - gesture.dx * k);
        lat.set(Math.max(-MAX_TILT, Math.min(MAX_TILT, startLat.get() + gesture.dy * k)));
      },
      onPanResponderRelease: (_event, gesture) => end(gesture.vx, gesture.vy),
      onPanResponderTerminate: () => end(0, 0),
    });
  }, [
    frame.radius,
    reduceMotion,
    lat,
    lon,
    zoom,
    startLat,
    startLon,
    startZoom,
    startSpread,
    touchCount,
    gestureEndedAt,
  ]);

  // Web: the wheel (or a trackpad pinch, which arrives as a wheel event) zooms.
  const box = useRef<ComponentRef<typeof View>>(null);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = box.current as unknown as HTMLElement | null;
    if (!node?.addEventListener) return;
    const onWheel = (event: WheelEvent) => {
      // Only take the wheel when it means zoom: a pinch, or any wheel once zoomed in.
      if (!event.ctrlKey && zoom.get() <= 1.02) return;
      event.preventDefault();
      setIdle(false);
      cancelAnimation(zoom);
      const next = Math.min(MAX_ZOOM, Math.max(1, zoom.get() * Math.exp(-event.deltaY * 0.01)));
      zoom.set(next);
      setZoomedByHand(next > 1.05);
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, [zoom]);

  const offsets = spreadPlaces(
    friends.map((friend) => friend.place),
    (frame.radius * Math.PI) / 180,
    MARKER_GAP.x,
    MARKER_GAP.y
  );
  const zoomedIn = selectedId !== null || zoomedByHand;

  return (
    <View
      ref={box}
      style={[styles.box, { width, height }]}
      testID={testID}
      {...responder.panHandlers}>
      {/* The whole globe is the way back out. */}
      <Pressable
        accessibilityLabel={zoomedIn ? 'Back to the whole world' : 'Globe'}
        accessibilityRole={zoomedIn ? 'button' : 'image'}
        disabled={!zoomedIn}
        onPress={() => {
          if (clock() - gestureEndedAt.get() > 300) backToWorld();
        }}
        style={StyleSheet.absoluteFill}
        testID={testID ? `${testID}-background` : undefined}>
        <GlobeCanvas camera={camera} frame={frame} />
      </Pressable>

      {me ? (
        <GlobePin camera={camera} frame={frame} lat={me.lat} lon={me.lon} zIndex={0}>
          <MeMarker label={me.label} />
        </GlobePin>
      ) : null}

      {friends.map((friend, index) => {
        const isSelected = friend.id === selectedId;
        return (
          <GlobePin
            camera={camera}
            frame={frame}
            key={friend.id}
            lat={friend.place.lat}
            lon={friend.place.lon}
            zIndex={isSelected ? 3 : 1}>
            <MapMarker
              detail={friend.place.label}
              emoji={friend.emoji}
              name={friend.name}
              offset={offsets[index]}
              onPress={() => onSelect(isSelected ? null : friend.id)}
              playing={friend.playing}
              recent={friend.recent}
              selected={isSelected}
              testID={friend.testID}
              tint={friend.tint}
              zoom={zoom}
            />
          </GlobePin>
        );
      })}

      {zoomedIn ? (
        <PillButton
          accessibilityLabel="Back to the whole world"
          icon="chevron-back"
          label="Whole world"
          onPress={backToWorld}
          size="sm"
          style={styles.back}
          testID="feed-map-back"
        />
      ) : null}
    </View>
  );
}

/** The time, read only from touch handlers. */
function clock(): number {
  return Date.now();
}

const styles = StyleSheet.create({
  box: {
    overflow: 'hidden',
    backgroundColor: colors.paper,
  },
  back: {
    position: 'absolute',
    left: space.md,
    top: space.sm,
  },
});
