/**
 * Web variant of `cymatic-figure.tsx`: the same figure on a plain HTML canvas.
 *
 * Skia on the web needs CanvasKit loaded before the module is imported, which
 * this app does not set up, so the web build draws with the 2D canvas API and
 * `requestAnimationFrame` instead. The maths is shared with the native figure
 * (`figure-tuning.ts`: pattern, seeding, stepping, wash grid), and so are the
 * props and the behaviour:
 *
 *   - grains: 1.3-point squares in album ink at 50% opacity, scaled by `width / 390`
 *   - the faint wash on its 3-point grid, turned with the figure
 *   - the radial fade to paper between radius 150 and 214
 *   - the 420 ms kick when `trackId` changes
 *   - paused: no motion, grains x 0.7, wash x 0.6
 *   - reduced motion (`prefers-reduced-motion: reduce`): settle off-screen, draw once per song
 *   - the loop stops when paused and settled, when `active` is false, when the
 *     tab is hidden, and on unmount
 *
 * The slow-device fallback of the native figure (fewer grains, every second
 * frame) is not ported: `stats.grains` is always the full count here.
 *
 * Usage is identical to the native file; see its header.
 */
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { View } from 'react-native';

import { hexToRgb, hexWithAlpha } from '@/lib/album-ink';

import type { CymaticFigureProps, FigureStats } from './cymatic-figure';
import {
  FADE_END,
  FADE_START,
  figureParams,
  figureTuning,
  GRAIN_OPACITY,
  GRAIN_SIZE,
  KICK_MS,
  KICK_POINTS,
  PAUSED_GRAIN_FACTOR,
  PAUSED_WASH_FACTOR,
  REF_HEIGHT,
  REF_WIDTH,
  seedGrains,
  SETTLE_STEPS,
  stepGrains,
  STEP_MS,
  WASH_CELLS,
  WASH_HALF,
  WASH_PEAK,
  washPixels,
  WINDOW_FRAMES,
} from './figure-tuning';

export type { CymaticFigureProps, FigureStats } from './cymatic-figure';

/** Everything the loop needs from React. Replaced whole on every change. */
type WebConfig = {
  running: boolean;
  playing: boolean;
  reduced: boolean;
  trackId: string;
  lobes: number;
  k: number;
  floor: number;
  omega: number;
  color: string;
  paperColor: string;
  width: number;
  height: number;
};

type WebFigure = {
  update: (config: WebConfig) => void;
  setStatsListener: (listener: ((stats: FigureStats) => void) | undefined) => void;
  destroy: () => void;
};

const IDLE_STATS: FigureStats = { running: false, fps: 0, grains: 0, stride: 1, workMs: 0 };

/** The figure on one canvas: owns the grains, the wash image and the frame loop. */
function createWebFigure(canvas: HTMLCanvasElement): WebFigure {
  const count = figureTuning.grains;
  const xs = new Float32Array(count);
  const ys = new Float32Array(count);
  const washCanvas = document.createElement('canvas');
  washCanvas.width = WASH_CELLS;
  washCanvas.height = WASH_CELLS;

  let cfg: WebConfig | null = null;
  let onStats: ((stats: FigureStats) => void) | undefined;
  let raf = 0;
  let destroyed = false;
  let seeded = false;
  let trackId = '';
  let lobes = 0;
  let k = 0;
  let phi = 0;
  let kickLeft = 0;
  let settleLeft = 0;
  let dirty = true;
  let clock = 0;
  let last: number | null = null;
  let windowFrames = 0;
  let windowMs = 0;
  let workMs = 0;
  let workSteps = 0;
  let washKey = '';
  let pixelRatio = 0;

  /** The wash for the current song: the coarse grid at rotation 0, in album ink. */
  function ensureWash(c: WebConfig) {
    const key = `${c.lobes}|${c.k}|${c.color}`;
    if (key === washKey) return;
    washKey = key;
    const ctx = washCanvas.getContext('2d');
    const rgb = hexToRgb(c.color);
    if (!ctx || !rgb) return;
    // `washPixels` is premultiplied; canvas image data is not. Keep its alpha, set the colour flat.
    const source = washPixels(c.lobes, c.k, rgb.r, rgb.g, rgb.b);
    const image = ctx.createImageData(WASH_CELLS, WASH_CELLS);
    for (let at = 0; at < source.length; at += 4) {
      image.data[at] = rgb.r;
      image.data[at + 1] = rgb.g;
      image.data[at + 2] = rgb.b;
      image.data[at + 3] = source[at + 3];
    }
    ctx.putImageData(image, 0, 0);
  }

  function draw(c: WebConfig) {
    const ratio = Math.min(3, window.devicePixelRatio || 1);
    const pixelWidth = Math.round(c.width * ratio);
    const pixelHeight = Math.round(c.height * ratio);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight || ratio !== pixelRatio) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
      pixelRatio = ratio;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const scale = c.width / REF_WIDTH;
    const cx = c.width / 2;
    const cy = c.height / 2;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);

    // Wash. f depends on θ + φ, so the wash at rotation φ is the φ = 0 wash turned by −φ.
    ensureWash(c);
    const washSize = 2 * WASH_HALF * scale;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-phi);
    ctx.globalAlpha = WASH_PEAK * (c.playing ? 1 : PAUSED_WASH_FACTOR);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(washCanvas, -washSize / 2, -washSize / 2, washSize, washSize);
    ctx.restore();

    // Grains.
    const size = GRAIN_SIZE * scale;
    const half = size / 2;
    ctx.globalAlpha = GRAIN_OPACITY * (c.playing ? 1 : PAUSED_GRAIN_FACTOR);
    ctx.fillStyle = c.color;
    for (let i = 0; i < count; i++) {
      ctx.fillRect(cx + xs[i] * scale - half, cy + ys[i] * scale - half, size, size);
    }

    // Fade to paper: clear up to radius 150, fully paper at 214.
    ctx.globalAlpha = 1;
    const fade = ctx.createRadialGradient(cx, cy, FADE_START * scale, cx, cy, FADE_END * scale);
    fade.addColorStop(0, hexWithAlpha(c.paperColor, 0));
    fade.addColorStop(1, c.paperColor);
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, c.width, c.height);
    dirty = false;
  }

  function schedule() {
    if (raf === 0 && !destroyed) raf = requestAnimationFrame(frame);
  }

  function stop() {
    if (raf !== 0) cancelAnimationFrame(raf);
    raf = 0;
    last = null;
    onStats?.(IDLE_STATS);
  }

  function frame(now: number) {
    raf = 0;
    const c = cfg;
    if (!c || destroyed) return;
    if (!c.running) {
      stop();
      return;
    }
    const animate = c.playing && !c.reduced;

    // What changed since the last frame.
    if (!seeded) {
      seedGrains(xs, ys, count);
      seeded = true;
      trackId = c.trackId;
      lobes = c.lobes;
      k = c.k;
      // Playing: let the grains be seen finding the figure. Still: settle first.
      if (!animate) settleLeft = SETTLE_STEPS;
    } else {
      if (trackId !== c.trackId) {
        trackId = c.trackId;
        if (animate) kickLeft = KICK_MS;
        else settleLeft = SETTLE_STEPS;
      }
      if (lobes !== c.lobes || k !== c.k) {
        lobes = c.lobes;
        k = c.k;
        if (!animate) settleLeft = SETTLE_STEPS;
      }
    }

    if (!animate) {
      // Still version: paused, or reduced motion.
      kickLeft = 0;
      clock = 0;
      last = null;
      if (settleLeft > 0) {
        const started = performance.now();
        while (settleLeft > 0) {
          stepGrains(xs, ys, count, lobes, k, phi, c.floor, 0);
          settleLeft -= 1;
          if (performance.now() - started > 10) break;
        }
        dirty = true;
        // Reduced motion draws once, when settled. Paused may show the grains arriving.
        if (!c.reduced || settleLeft === 0) draw(c);
        schedule();
        return;
      }
      if (dirty) draw(c);
      stop(); // nothing left to do until the inputs change
      return;
    }

    // Playing.
    settleLeft = 0;
    const since = last === null ? null : now - last;
    last = now;
    const restarted = since === null || since > 250;
    const elapsed = restarted ? STEP_MS : since;
    if (restarted) {
      windowFrames = 0;
      windowMs = 0;
      workMs = 0;
      workSteps = 0;
    } else {
      windowFrames += 1;
      windowMs += elapsed;
    }

    // Fixed 60 Hz steps, whatever the display rate.
    clock += Math.min(elapsed, 50);
    if (clock >= STEP_MS - 1) {
      clock = Math.min(Math.max(0, clock - STEP_MS), STEP_MS);
      const started = performance.now();
      const kick = KICK_POINTS * (kickLeft / KICK_MS);
      kickLeft = Math.max(0, kickLeft - STEP_MS);
      phi += c.omega * (STEP_MS / 1000);
      stepGrains(xs, ys, count, lobes, k, phi, c.floor, kick);
      draw(c);
      workMs += performance.now() - started;
      workSteps += 1;
    } else if (dirty) {
      draw(c);
    }

    if (windowFrames >= WINDOW_FRAMES) {
      onStats?.({
        running: true,
        fps: 1000 / (windowMs / windowFrames),
        grains: count,
        stride: 1,
        workMs: workSteps > 0 ? workMs / workSteps : 0,
      });
      windowFrames = 0;
      windowMs = 0;
      workMs = 0;
      workSteps = 0;
    }
    schedule();
  }

  return {
    update(next) {
      cfg = next;
      // Colour, dimming and size are drawn, not simulated: any change needs one frame.
      dirty = true;
      if (next.running) schedule();
      else stop();
    },
    setStatsListener(listener) {
      onStats = listener;
    },
    destroy() {
      destroyed = true;
      if (raf !== 0) cancelAnimationFrame(raf);
      raf = 0;
    },
  };
}

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function subscribeReducedMotion(listener: () => void) {
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}

const getReducedMotion = () => window.matchMedia(REDUCED_MOTION_QUERY).matches;

function subscribeVisibility(listener: () => void) {
  document.addEventListener('visibilitychange', listener);
  return () => document.removeEventListener('visibilitychange', listener);
}

const getVisible = () => document.visibilityState === 'visible';
// Server render: assume motion is allowed and the tab is visible; nothing is drawn there anyway.
const serverFalse = () => false;
const serverTrue = () => true;

const CANVAS_STYLE = { display: 'block', width: '100%', height: '100%' } as const;

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
  const reduced = useSyncExternalStore(subscribeReducedMotion, getReducedMotion, serverFalse);
  const visible = useSyncExternalStore(subscribeVisibility, getVisible, serverTrue);
  const figureHeight = height ?? Math.round((width * REF_HEIGHT) / REF_WIDTH);
  const running = active && visible && width > 0;
  const { lobes, k, floor, omega } = figureParams(energy, bpm);
  const track = String(trackId ?? '');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const figureRef = useRef<WebFigure | null>(null);

  // One figure per canvas, for the life of the component. Declared first so it
  // exists before the effects below push the config into it.
  useEffect(() => {
    if (!canvasRef.current) return;
    const figure = createWebFigure(canvasRef.current);
    figureRef.current = figure;
    return () => {
      figure.destroy();
      figureRef.current = null;
    };
  }, []);

  useEffect(() => {
    figureRef.current?.setStatsListener(onStats);
  }, [onStats]);

  useEffect(() => {
    figureRef.current?.update({
      running,
      playing,
      reduced,
      trackId: track,
      lobes,
      k,
      floor,
      omega,
      color,
      paperColor,
      width,
      height: figureHeight,
    });
  }, [running, playing, reduced, track, lobes, k, floor, omega, color, paperColor, width, figureHeight]);

  return (
    <View style={[{ width, height: figureHeight, pointerEvents: 'none' }, style]}>
      <canvas aria-hidden ref={canvasRef} style={CANVAS_STYLE} />
    </View>
  );
}
