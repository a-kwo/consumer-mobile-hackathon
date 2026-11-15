import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { PanResponder, Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  css,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { PillButton } from '@/components/ui';
import { colors, space } from '@/theme';

import { DAY_PATH_RADIUS, DayPath } from './day-path';
import { LandLayer } from './land-layer';
import { MapMarker, MeMarker } from './map-marker';
import type { Place, Stop } from './places';
import { MAP_ASPECT, project, spreadMarkers } from './projection';

export type MapFriend = {
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

export type WorldMapProps = {
  /** Width of the frame, in points. The frame is `width / MAP_ASPECT` tall. */
  width: number;
  friends: readonly MapFriend[];
  /** Your own position, when known. */
  me?: Place | null;
  /** The friend the map is zoomed on, or null for the whole world. */
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** The selected friend's stops, drawn around them once zoomed in. */
  stops?: readonly Stop[];
  /** Tracklist index of the track being replayed, among `stops`. */
  activeStopIndex?: number | null;
  testID?: string;
};

/** How far the map zooms onto a friend, and the most a pinch can reach. */
const FOCUS_ZOOM = 3.4;
const MAX_ZOOM = 5;
const ZOOM_MS = 600;
/** Space a marker and its name need at world scale. */
const MARKER_GAP = { x: 46, y: 50 };

type Camera = { scale: number; x: number; y: number };

/** The route fades in as the zoom lands. */
const appear = css.keyframes({
  from: { opacity: 0, transform: [{ scale: 0.92 }] },
  to: { opacity: 1, transform: [{ scale: 1 }] },
});

/**
 * The friends map: the world as ink grains on paper, a marker per friend, and
 * a camera that glides onto whoever is selected.
 *
 * Touch: tap a marker to zoom to that friend; tap the map (or "Whole world")
 * to zoom back out. While zoomed in, drag to pan and pinch to zoom; on the web
 * the mouse wheel or a trackpad pinch zooms about the pointer. At world scale
 * a one-finger drag is left alone, so the page around the map still scrolls.
 */
export function WorldMap({
  width,
  friends,
  me,
  selectedId,
  onSelect,
  stops,
  activeStopIndex,
  testID,
}: WorldMapProps) {
  const height = width / MAP_ASPECT;
  const reduceMotion = useReducedMotion();

  // The camera: the map is drawn at `scale`, then moved by (x, y).
  const scale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  // Where a gesture started from.
  const startScale = useSharedValue(1);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const startSpread = useSharedValue(0);
  const touchCount = useSharedValue(0);
  // When the last drag or pinch ended. In a browser the mouse-up that ends a
  // drag also clicks the map, and that click must not zoom back out.
  const gestureEndedAt = useSharedValue(0);
  // True once the user has zoomed in by hand, so the way back is offered.
  const [zoomedByHand, setZoomedByHand] = useState(false);

  const points = friends.map((friend) => project(friend.place.lat, friend.place.lon, width));
  const mePoint = me ? project(me.lat, me.lon, width) : null;
  const offsets = spreadMarkers(points, MARKER_GAP.x, MARKER_GAP.y, { width, height }, mePoint);
  const selectedIndex = friends.findIndex((friend) => friend.id === selectedId);
  const selected = selectedIndex >= 0 ? friends[selectedIndex] : null;
  const selectedPoint = selectedIndex >= 0 ? points[selectedIndex] : null;
  const hasRoute = !!selected && !!stops && stops.length > 0;

  // Glide to the selected friend, or back out to the world.
  const focusX = selectedPoint?.x ?? null;
  const focusY = selectedPoint?.y ?? null;
  useEffect(() => {
    const target: Camera =
      focusX === null || focusY === null
        ? { scale: 1, x: 0, y: 0 }
        : clampCamera(
            {
              scale: FOCUS_ZOOM,
              x: width / 2 - focusX * FOCUS_ZOOM,
              // A little below centre, leaving room for the avatar above the route.
              y: height * 0.6 - focusY * FOCUS_ZOOM,
            },
            width,
            height
          );
    const timing = {
      duration: reduceMotion ? 0 : ZOOM_MS,
      easing: Easing.inOut(Easing.cubic),
    };
    scale.set(withTiming(target.scale, timing));
    x.set(withTiming(target.x, timing));
    y.set(withTiming(target.y, timing));
  }, [focusX, focusY, width, height, reduceMotion, scale, x, y]);

  const backToWorld = () => {
    setZoomedByHand(false);
    if (selectedId !== null) {
      onSelect(null);
      return;
    }
    const timing = { duration: reduceMotion ? 0 : ZOOM_MS, easing: Easing.inOut(Easing.cubic) };
    scale.set(withTiming(1, timing));
    x.set(withTiming(0, timing));
    y.set(withTiming(0, timing));
  };

  // Drag and pinch. Plain touch handling on the JS thread: the map is light
  // enough for it, and it behaves the same on iOS, Android and the web.
  const responder = useMemo(() => {
    const rebase = (touches: readonly { pageX: number; pageY: number }[]) => {
      startScale.set(scale.get());
      startX.set(x.get());
      startY.set(y.get());
      startSpread.set(
        touches.length >= 2
          ? Math.hypot(touches[0].pageX - touches[1].pageX, touches[0].pageY - touches[1].pageY)
          : 0
      );
      touchCount.set(touches.length);
    };
    const wants = (touches: number, dx: number, dy: number) =>
      touches >= 2 || (scale.get() > 1.02 && Math.hypot(dx, dy) > 6);

    return PanResponder.create({
      onMoveShouldSetPanResponder: (event, gesture) =>
        wants(event.nativeEvent.touches.length, gesture.dx, gesture.dy),
      onMoveShouldSetPanResponderCapture: (event, gesture) =>
        wants(event.nativeEvent.touches.length, gesture.dx, gesture.dy),
      onPanResponderGrant: (event) => rebase(event.nativeEvent.touches),
      onPanResponderMove: (event, gesture) => {
        const touches = event.nativeEvent.touches;
        if (touches.length !== touchCount.get()) {
          // A finger came or went: carry on from where the map is now.
          rebase(touches);
          startX.set(x.get() - gesture.dx);
          startY.set(y.get() - gesture.dy);
          return;
        }
        let next: Camera;
        if (touches.length >= 2 && startSpread.get() > 0) {
          const spread = Math.hypot(
            touches[0].pageX - touches[1].pageX,
            touches[0].pageY - touches[1].pageY
          );
          const zoom = Math.min(
            MAX_ZOOM,
            Math.max(1, (startScale.get() * spread) / startSpread.get())
          );
          // Zoom about the middle of the frame.
          const ratio = zoom / startScale.get();
          next = {
            scale: zoom,
            x: width / 2 - (width / 2 - startX.get()) * ratio + gesture.dx,
            y: height / 2 - (height / 2 - startY.get()) * ratio + gesture.dy,
          };
        } else {
          next = {
            scale: scale.get(),
            x: startX.get() + gesture.dx,
            y: startY.get() + gesture.dy,
          };
        }
        const clamped = clampCamera(next, width, height);
        scale.set(clamped.scale);
        x.set(clamped.x);
        y.set(clamped.y);
      },
      onPanResponderRelease: () => {
        touchCount.set(0);
        gestureEndedAt.set(clock());
        setZoomedByHand(scale.get() > 1.05);
      },
      onPanResponderTerminate: () => {
        touchCount.set(0);
        gestureEndedAt.set(clock());
        setZoomedByHand(scale.get() > 1.05);
      },
    });
  }, [width, height, scale, x, y, startScale, startX, startY, startSpread, touchCount, gestureEndedAt]);

  // Web: the wheel (or a trackpad pinch, which arrives as a wheel event) zooms about the pointer.
  const frame = useRef<ComponentRef<typeof View>>(null);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = frame.current as unknown as HTMLElement | null;
    if (!node?.addEventListener) return;
    const onWheel = (event: WheelEvent) => {
      // Only take the wheel when it means zoom: a pinch, or any wheel once zoomed in.
      if (!event.ctrlKey && scale.get() <= 1.02) return;
      event.preventDefault();
      const box = node.getBoundingClientRect();
      const px = event.clientX - box.left;
      const py = event.clientY - box.top;
      const current = scale.get();
      const zoom = Math.min(MAX_ZOOM, Math.max(1, current * Math.exp(-event.deltaY * 0.01)));
      const ratio = zoom / current;
      const clamped = clampCamera(
        { scale: zoom, x: px - (px - x.get()) * ratio, y: py - (py - y.get()) * ratio },
        width,
        height
      );
      scale.set(clamped.scale);
      x.set(clamped.x);
      y.set(clamped.y);
      setZoomedByHand(clamped.scale > 1.05);
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, [width, height, scale, x, y]);

  const camera = useAnimatedStyle(() => ({
    transform: [{ translateX: x.get() }, { translateY: y.get() }, { scale: scale.get() }],
  }));
  // The route holds its size on screen, like the markers.
  const routeScale = useAnimatedStyle(() => ({ transform: [{ scale: 1 / scale.get() }] }));

  const zoomedIn = selectedId !== null || zoomedByHand;

  return (
    <View
      ref={frame}
      style={[styles.frame, { width, height }]}
      testID={testID}
      {...responder.panHandlers}>
      <Animated.View style={[styles.world, { width, height }, camera]}>
        {/* The whole map is the way back out. */}
        <Pressable
          accessibilityLabel={zoomedIn ? 'Back to the whole world' : 'World map'}
          accessibilityRole={zoomedIn ? 'button' : 'image'}
          disabled={!zoomedIn}
          onPress={() => {
            if (clock() - gestureEndedAt.get() > 300) backToWorld();
          }}
          style={StyleSheet.absoluteFill}
          testID={testID ? `${testID}-background` : undefined}>
          <LandLayer width={width} />
        </Pressable>

        {hasRoute && selectedPoint ? (
          <Animated.View
            style={[styles.route, { left: selectedPoint.x, top: selectedPoint.y }, routeScale]}>
            <Animated.View
              style={[
                styles.routeBody,
                reduceMotion
                  ? null
                  : {
                      animationName: appear,
                      animationDuration: 360,
                      animationDelay: ZOOM_MS - 220,
                      animationFillMode: 'backwards',
                      animationTimingFunction: 'ease-out',
                    },
              ]}>
              <DayPath
                activeIndex={activeStopIndex}
                stops={stops ?? []}
                testID={testID ? `${testID}-route` : undefined}
                tint={selected?.tint}
              />
            </Animated.View>
          </Animated.View>
        ) : null}

        {me && mePoint ? <MeMarker label={me.label} point={mePoint} scale={scale} /> : null}

        {friends.map((friend, index) => {
          const isSelected = friend.id === selectedId;
          return (
            <MapMarker
              detail={friend.place.label}
              emoji={friend.emoji}
              key={friend.id}
              lift={isSelected && hasRoute ? DAY_PATH_RADIUS + 16 : 0}
              name={friend.name}
              offset={offsets[index]}
              onPress={() => onSelect(isSelected ? null : friend.id)}
              playing={friend.playing}
              point={points[index]}
              recent={friend.recent}
              scale={scale}
              selected={isSelected}
              testID={friend.testID}
              tint={friend.tint}
            />
          );
        })}
      </Animated.View>

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

/** Keeps the camera inside the map: never zoomed out past the world, never showing past an edge. */
function clampCamera(camera: Camera, width: number, height: number): Camera {
  const scale = Math.min(MAX_ZOOM, Math.max(1, camera.scale));
  return {
    scale,
    x: Math.min(0, Math.max(width - width * scale, camera.x)),
    y: Math.min(0, Math.max(height - height * scale, camera.y)),
  };
}

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
    backgroundColor: colors.paper,
  },
  world: {
    transformOrigin: 'left top',
  },
  route: {
    position: 'absolute',
    width: 0,
    height: 0,
    zIndex: 2,
    pointerEvents: 'none',
  },
  routeBody: {
    position: 'absolute',
    left: -DAY_PATH_RADIUS,
    top: -DAY_PATH_RADIUS,
  },
  back: {
    position: 'absolute',
    left: space.md,
    top: space.md,
  },
});
