/**
 * CymaticFigure: fine grains settling on the nodal lines of a resonance
 * pattern, with a faint wash under the lines and a radial fade to paper
 * (plan 5, "The cymatic figure"). It sits behind and around the cover on the
 * Now screen. Most screens should use `NowCover`, which stacks this with the
 * cover; use this directly only for a custom layout.
 *
 *   <CymaticFigure
 *     width={screenWidth}          // the plan's 390-wide region, scaled
 *     energy={track.energy}        // 0 to 1: lobes, line spacing, shimmer
 *     bpm={track.bpm}              // rotation speed
 *     color={albumInk(track.coverColor, INK_MUTED)}
 *     playing={isPlaying}
 *     trackId={track.id}           // a change scatters the grains (the kick)
 *   />
 *
 * Props
 *   energy      0 to 1. `n = 3 + round(5·energy)` lobes, `λ = 44 − 18·energy`.
 *   bpm         Rotation is `0.03 rad/s · bpm / 120`.
 *   color       Album ink hex, already clamped (see `@/lib/album-ink`).
 *   playing     false stops grains and rotation and dims them (x 0.7, wash x 0.6).
 *   trackId     Any change triggers the 420 ms kick and a new figure.
 *   width       Width in points. Every length in the plan is scaled by `width / 390`.
 *   height      Defaults to `width · 417 / 390`. The pattern is centred in the box.
 *   paperColor  The colour the figure fades into. Must match the screen. @default '#F4EDE1'
 *   active      Pass false when the screen is hidden (not focused). Stops the frame loop. @default true
 *   onStats     Optional, about once a second while the loop runs, and once when it stops.
 *   style       Extra style for the canvas (for example absolute positioning).
 *
 * How it runs
 *   - Grain positions live in two Float32Arrays that exist only on the UI
 *     thread. A Reanimated frame callback steps them and copies them into one
 *     shared array that a single Skia `<Points>` node draws. React does not
 *     render per frame.
 *   - The loop runs only while there is something to animate. It stops when
 *     paused (after settling), when `active` is false, when the app leaves the
 *     foreground and on unmount.
 *   - Reduced motion (the platform setting): no animation. On each song the
 *     grains settle off-screen for about 220 steps and are drawn once.
 *   - If frames are slow it drops grains (down to 1,500), then steps every
 *     second frame, and climbs back when there is headroom.
 *
 * Needs a development build (Skia has native code). On web this file is
 * replaced by `cymatic-figure.web.tsx`, which draws nothing.
 */
import {
  AlphaType,
  Canvas,
  ColorType,
  FilterMode,
  Image,
  notifyChange,
  Points,
  RadialGradient,
  Rect,
  Skia,
  vec,
  type SkImage,
  type Transforms3d,
} from '@shopify/react-native-skia';
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { AccessibilityInfo, AppState, type StyleProp, type ViewStyle } from 'react-native';
import {
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { hexToRgb, hexWithAlpha } from '@/lib/album-ink';

import {
  CHEAP_WORK_MS,
  FADE_END,
  FADE_START,
  FAST_FRAME_MS,
  figureParams,
  figureTuning,
  GRAIN_OPACITY,
  GRAIN_SIZE,
  KICK_MS,
  KICK_POINTS,
  MIN_GRAINS,
  PAUSED_GRAIN_FACTOR,
  PAUSED_WASH_FACTOR,
  REF_HEIGHT,
  REF_WIDTH,
  seedGrains,
  SETTLE_STEPS,
  SLOW_FRAME_MS,
  stepGrains,
  STEP_MS,
  WASH_CELLS,
  WASH_HALF,
  WASH_PEAK,
  washPixels,
  WINDOW_FRAMES,
} from './figure-tuning';

export type FigureStats = {
  /** False when the frame loop is stopped (paused and settled, hidden, backgrounded). */
  running: boolean;
  /** Mean UI-thread frame rate over the last window. 0 when stopped. */
  fps: number;
  /** Grains currently simulated and drawn. */
  grains: number;
  /** 1 = a step every 60 Hz frame, 2 = every second frame (the slow-device fallback). */
  stride: number;
  /** Mean cost of one simulation step plus the copy to the draw buffer, in ms. */
  workMs: number;
};

export type CymaticFigureProps = {
  energy: number;
  bpm: number;
  color: string;
  playing: boolean;
  trackId: string | number | null | undefined;
  width: number;
  height?: number;
  paperColor?: string;
  active?: boolean;
  onStats?: (stats: FigureStats) => void;
  style?: StyleProp<ViewStyle>;
};

type Point = { x: number; y: number };

/** What the React side tells the frame loop. Replaced whole on every change. */
type FigureConfig = {
  playing: boolean;
  reduced: boolean;
  trackId: string;
  lobes: number;
  k: number;
  floor: number;
  omega: number;
  scale: number;
  cx: number;
  cy: number;
  grains: number;
  /** Bumped on every config change, so a stale "I am idle" from the loop can be ignored. */
  token: number;
};

/** Everything the loop remembers. Created and kept on the UI thread only. */
type SimState = {
  xs: Float32Array;
  ys: Float32Array;
  capacity: number;
  /** Grains in use. Lower than `capacity` after the slow-frame fallback. */
  count: number;
  stride: number;
  seeded: boolean;
  trackId: string;
  lobes: number;
  k: number;
  scale: number;
  cx: number;
  cy: number;
  phi: number;
  /** Milliseconds of kick left. */
  kickLeft: number;
  /** Off-screen steps left before the still version is drawn. */
  settleLeft: number;
  /** Positions changed, or the geometry did, since the last draw. */
  dirty: boolean;
  /** Time since the last simulation step. */
  clock: number;
  windowFrames: number;
  windowMs: number;
  workMs: number;
  workSteps: number;
  /** Measuring windows to ignore (start-up and resume hitches). */
  skipWindows: number;
  goodWindows: number;
  recoveries: number;
  idleToken: number;
};

function createSim(capacity: number): SimState {
  'worklet';
  return {
    xs: new Float32Array(capacity),
    ys: new Float32Array(capacity),
    capacity,
    count: capacity,
    stride: 1,
    seeded: false,
    trackId: '',
    lobes: 0,
    k: 0,
    scale: 0,
    cx: 0,
    cy: 0,
    phi: 0,
    kickLeft: 0,
    settleLeft: 0,
    dirty: true,
    clock: 0,
    windowFrames: 0,
    windowMs: 0,
    workMs: 0,
    workSteps: 0,
    skipWindows: 1,
    goodWindows: 0,
    recoveries: 0,
    idleToken: -1,
  };
}

/** Copies the grains into the array Skia draws, scaled to the canvas, and asks for a redraw. */
function publish(
  s: SimState,
  points: SharedValue<Point[]>,
  washTransform: SharedValue<Transforms3d>,
): void {
  'worklet';
  let out = points.value;
  if (out.length !== s.count) {
    out = new Array<Point>(s.count);
    for (let i = 0; i < s.count; i++) out[i] = { x: 0, y: 0 };
  }
  const { xs, ys, scale, cx, cy } = s;
  for (let i = 0; i < s.count; i++) {
    const p = out[i];
    p.x = cx + xs[i] * scale;
    p.y = cy + ys[i] * scale;
  }
  if (out !== points.value) {
    points.value = out;
  } else {
    // Mutated in place: tell the canvas the same array has new contents.
    notifyChange(points);
  }
  // f depends on θ + φ, so the wash at rotation φ is the φ = 0 wash turned by −φ.
  washTransform.value = [{ rotate: -s.phi }];
  s.dirty = false;
}

/** The slow-device fallbacks from the plan, in order, and the way back up. */
function adapt(s: SimState, meanFrameMs: number, meanWorkMs: number): void {
  'worklet';
  if (meanFrameMs > SLOW_FRAME_MS) {
    s.goodWindows = 0;
    if (s.count > MIN_GRAINS) {
      s.count = Math.max(MIN_GRAINS, Math.floor(s.count * 0.75));
    } else if (s.stride === 1) {
      s.stride = 2;
    }
    return;
  }
  const degraded = s.stride > 1 || s.count < s.capacity;
  if (!degraded || meanFrameMs > FAST_FRAME_MS || meanWorkMs > CHEAP_WORK_MS) {
    s.goodWindows = 0;
    return;
  }
  s.goodWindows += 1;
  // Five clean windows in a row (about five seconds), and at most two climbs,
  // so a device on the edge does not flip back and forth.
  if (s.goodWindows >= 5 && s.recoveries < 2) {
    s.goodWindows = 0;
    s.recoveries += 1;
    if (s.stride > 1) s.stride = 1;
    else s.count = Math.min(s.capacity, Math.ceil(s.count * 1.25));
  }
}

/** One display frame. Runs on the UI thread. */
function runFrame(
  s: SimState,
  cfg: FigureConfig,
  sincePrevious: number | null,
  points: SharedValue<Point[]>,
  washTransform: SharedValue<Transforms3d>,
  onIdle: (token: number) => void,
  onStats: (stats: FigureStats) => void,
): void {
  'worklet';
  const animate = cfg.playing && !cfg.reduced;

  // What changed since the last frame.
  if (!s.seeded) {
    seedGrains(s.xs, s.ys, s.capacity);
    s.seeded = true;
    s.trackId = cfg.trackId;
    s.lobes = cfg.lobes;
    s.k = cfg.k;
    // Playing: let the grains be seen finding the figure. Still: settle first.
    if (!animate) s.settleLeft = SETTLE_STEPS;
  } else {
    if (s.trackId !== cfg.trackId) {
      s.trackId = cfg.trackId;
      if (animate) s.kickLeft = KICK_MS;
      else s.settleLeft = SETTLE_STEPS;
    }
    if (s.lobes !== cfg.lobes || s.k !== cfg.k) {
      s.lobes = cfg.lobes;
      s.k = cfg.k;
      if (!animate) s.settleLeft = SETTLE_STEPS;
    }
  }
  if (s.scale !== cfg.scale || s.cx !== cfg.cx || s.cy !== cfg.cy) {
    s.scale = cfg.scale;
    s.cx = cfg.cx;
    s.cy = cfg.cy;
    s.dirty = true;
  }

  if (!animate) {
    // Still version: paused, or reduced motion.
    s.kickLeft = 0;
    s.clock = 0;
    if (s.settleLeft > 0) {
      // As many steps as fit in about 10 ms, so settling never stalls the UI thread.
      const started = performance.now();
      while (s.settleLeft > 0) {
        stepGrains(s.xs, s.ys, s.count, s.lobes, s.k, s.phi, cfg.floor, 0);
        s.settleLeft -= 1;
        if (performance.now() - started > 10) break;
      }
      s.dirty = true;
      // Reduced motion draws once, when settled. Paused may show the grains arriving.
      if (!cfg.reduced || s.settleLeft === 0) publish(s, points, washTransform);
      return;
    }
    if (s.dirty) publish(s, points, washTransform);
    if (s.idleToken !== cfg.token) {
      // Nothing left to do: ask the React side to stop the frame loop.
      s.idleToken = cfg.token;
      scheduleOnRN(onIdle, cfg.token);
    }
    return;
  }

  // Playing.
  s.settleLeft = 0;
  const restarted = sincePrevious === null || sincePrevious > 250;
  const elapsed = restarted ? STEP_MS : sincePrevious;
  if (restarted) {
    s.windowFrames = 0;
    s.windowMs = 0;
    s.workMs = 0;
    s.workSteps = 0;
    s.skipWindows = 1;
  } else {
    s.windowFrames += 1;
    s.windowMs += elapsed;
  }

  // Fixed 60 Hz steps (30 Hz at stride 2), whatever the display rate.
  const tick = STEP_MS * s.stride;
  s.clock += Math.min(elapsed, 50);
  if (s.clock >= tick - 1) {
    s.clock = Math.min(Math.max(0, s.clock - tick), tick);
    const started = performance.now();
    const kick = KICK_POINTS * (s.kickLeft / KICK_MS);
    s.kickLeft = Math.max(0, s.kickLeft - tick);
    s.phi += cfg.omega * (tick / 1000);
    stepGrains(s.xs, s.ys, s.count, s.lobes, s.k, s.phi, cfg.floor, kick);
    publish(s, points, washTransform);
    s.workMs += performance.now() - started;
    s.workSteps += 1;
  }

  if (s.windowFrames >= WINDOW_FRAMES) {
    const meanFrameMs = s.windowMs / s.windowFrames;
    const meanWorkMs = s.workSteps > 0 ? s.workMs / s.workSteps : 0;
    s.windowFrames = 0;
    s.windowMs = 0;
    s.workMs = 0;
    s.workSteps = 0;
    if (s.skipWindows > 0) s.skipWindows -= 1;
    else adapt(s, meanFrameMs, meanWorkMs);
    scheduleOnRN(onStats, {
      running: true,
      fps: 1000 / meanFrameMs,
      grains: s.count,
      stride: s.stride,
      workMs: meanWorkMs,
    });
  }
}

/** The wash for one song: the coarse grid as a small image, drawn scaled up and turned. */
function makeWashImage(lobes: number, k: number, color: string): SkImage | null {
  const rgb = hexToRgb(color);
  if (!rgb) return null;
  const pixels = washPixels(lobes, k, rgb.r, rgb.g, rgb.b);
  return Skia.Image.MakeImage(
    {
      width: WASH_CELLS,
      height: WASH_CELLS,
      colorType: ColorType.RGBA_8888,
      alphaType: AlphaType.Premul,
    },
    Skia.Data.fromBytes(pixels),
    WASH_CELLS * 4,
  );
}

// The platform's reduced-motion setting, kept current while any figure is mounted.
let reduceMotion: boolean | null = null;
const reduceMotionListeners = new Set<() => void>();
let reduceMotionWatched = false;

function setReduceMotion(next: boolean) {
  if (reduceMotion === next) return;
  reduceMotion = next;
  reduceMotionListeners.forEach((listener) => listener());
}

function subscribeReduceMotion(listener: () => void) {
  reduceMotionListeners.add(listener);
  if (!reduceMotionWatched) {
    reduceMotionWatched = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduceMotion)
      .catch(() => {});
    AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
  }
  return () => {
    reduceMotionListeners.delete(listener);
  };
}

const getReduceMotion = () => reduceMotion;

function subscribeAppState(listener: () => void) {
  const subscription = AppState.addEventListener('change', listener);
  return () => subscription.remove();
}

const getAppState = () => AppState.currentState;

const IDLE_STATS: FigureStats = { running: false, fps: 0, grains: 0, stride: 1, workMs: 0 };
const WASH_SAMPLING = { filter: FilterMode.Linear };

export function CymaticFigure({
  energy,
  bpm,
  color,
  playing,
  trackId,
  width,
  height,
  paperColor = '#F4EDE1',
  active = true,
  onStats,
  style,
}: CymaticFigureProps) {
  // Reanimated knows the setting at launch; AccessibilityInfo follows later changes.
  const reducedAtLaunch = useReducedMotion();
  const reducedLive = useSyncExternalStore(subscribeReduceMotion, getReduceMotion, getReduceMotion);
  const reduced = reducedLive ?? reducedAtLaunch;
  const appState = useSyncExternalStore(subscribeAppState, getAppState, getAppState);
  const running = active && appState === 'active' && width > 0;

  const figureHeight = height ?? Math.round((width * REF_HEIGHT) / REF_WIDTH);
  const scale = width / REF_WIDTH;
  const cx = width / 2;
  const cy = figureHeight / 2;
  const { lobes, k, floor, omega } = figureParams(energy, bpm);
  const track = String(trackId ?? '');

  const config = useSharedValue<FigureConfig>({
    playing,
    reduced,
    trackId: track,
    lobes,
    k,
    floor,
    omega,
    scale,
    cx,
    cy,
    grains: figureTuning.grains,
    token: 0,
  });
  const sim = useSharedValue<SimState | null>(null);
  const points = useSharedValue<Point[]>([]);
  const washTransform = useSharedValue<Transforms3d>([{ rotate: 0 }]);

  const tokenRef = useRef(0);
  const onStatsRef = useRef(onStats);
  useEffect(() => {
    onStatsRef.current = onStats;
  }, [onStats]);

  const reportStats = useCallback((stats: FigureStats) => {
    onStatsRef.current?.(stats);
  }, []);

  // The loop reports that it has nothing left to draw (paused and settled).
  // Stable, so the frame callback is registered once; the body is set below.
  const idleRef = useRef<((token: number) => void) | null>(null);
  const handleIdle = useCallback((token: number) => {
    idleRef.current?.(token);
  }, []);

  const frame = useFrameCallback((info) => {
    'worklet';
    const cfg = config.value;
    let s = sim.value;
    if (s === null || s.capacity !== cfg.grains) {
      s = createSim(cfg.grains);
      sim.value = s;
    }
    runFrame(s, cfg, info.timeSincePreviousFrame, points, washTransform, handleIdle, reportStats);
  }, false);

  useEffect(() => {
    idleRef.current = (token: number) => {
      if (token !== tokenRef.current) return; // the inputs changed since; keep running
      frame.setActive(false);
      onStatsRef.current?.(IDLE_STATS);
    };
  }, [frame]);

  useEffect(() => {
    tokenRef.current += 1;
    config.set({
      playing,
      reduced,
      trackId: track,
      lobes,
      k,
      floor,
      omega,
      scale,
      cx,
      cy,
      grains: figureTuning.grains,
      token: tokenRef.current,
    });
    // Any change may need a frame (a new figure to settle, a resize to redraw).
    // The loop stops itself again once it is idle.
    frame.setActive(running);
    if (!running) onStatsRef.current?.(IDLE_STATS);
  }, [config, frame, running, playing, reduced, track, lobes, k, floor, omega, scale, cx, cy]);

  const wash = useMemo(() => makeWashImage(lobes, k, color), [lobes, k, color]);
  const clearPaper = hexWithAlpha(paperColor, 0);
  const washSize = 2 * WASH_HALF * scale;

  return (
    <Canvas
      colorSpace="srgb"
      style={[{ width, height: figureHeight, pointerEvents: 'none' }, style]}>
      <Image
        fit="fill"
        height={washSize}
        image={wash}
        opacity={WASH_PEAK * (playing ? 1 : PAUSED_WASH_FACTOR)}
        origin={vec(cx, cy)}
        sampling={WASH_SAMPLING}
        transform={washTransform}
        width={washSize}
        x={cx - washSize / 2}
        y={cy - washSize / 2}
      />
      <Points
        color={color}
        mode="points"
        opacity={GRAIN_OPACITY * (playing ? 1 : PAUSED_GRAIN_FACTOR)}
        points={points}
        strokeCap="butt"
        strokeWidth={GRAIN_SIZE * scale}
        style="stroke"
      />
      <Rect height={figureHeight} width={width} x={0} y={0}>
        <RadialGradient
          c={vec(cx, cy)}
          colors={[clearPaper, clearPaper, paperColor]}
          positions={[0, FADE_START / FADE_END, 1]}
          r={FADE_END * scale}
        />
      </Rect>
    </Canvas>
  );
}
