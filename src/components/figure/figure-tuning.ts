/**
 * The cymatic figure's tuning and maths, in one place (plan 5, "The cymatic
 * figure" and "Tuning").
 *
 * Change the look here: `figureTuning` holds the three values the design
 * sample exposed as sliders. Everything else is derived from them or copied
 * from the plan.
 *
 * All lengths are in reference points: the plan's 390-wide screen, with the
 * origin at the centre of the cover. `CymaticFigure` multiplies by
 * `width / 390` when it draws, so the simulation never depends on the device.
 *
 * This file has no imports on purpose. The functions marked 'worklet' run on
 * the UI thread inside the figure's frame callback, and the same file is
 * loaded as is by the Node maths check.
 */

/** The three values to tune on a phone. */
export const figureTuning = {
  /** Number of grains. Try 1,000 to 6,000. */
  grains: 3200,
  /** How present the figure is, 0 to 1. Drives grain opacity and the wash peak. */
  strength: 0.5,
  /** How lively the figure is, 0 to 1. Scales shimmer and rotation. */
  motion: 0.5,
};

/** Grain opacity while playing: `0.25 + 0.5 * strength` (0.5 at the default). */
export const GRAIN_OPACITY = 0.25 + 0.5 * figureTuning.strength;
/** Peak wash opacity while playing: `0.18 * strength` (0.09 at the default). */
export const WASH_PEAK = 0.18 * figureTuning.strength;
/** Multiplier on shimmer and rotation: `0.3 + 1.4 * motion` (1 at the default). */
export const MOTION_SCALE = 0.3 + 1.4 * figureTuning.motion;
/** Paused: grain opacity x 0.7, wash x 0.6. */
export const PAUSED_GRAIN_FACTOR = 0.7;
export const PAUSED_WASH_FACTOR = 0.6;

/** The reference frame every length below is measured in. */
export const REF_WIDTH = 390;
export const REF_HEIGHT = 417;
/** Grains live in a ring between these two radii. */
export const RING_INNER = 100;
export const RING_OUTER = 216;
/** The radial fade to paper: clear at `FADE_START`, fully paper at `FADE_END`. */
export const FADE_START = 150;
export const FADE_END = 214;
/** The cover: 272 square, radius 6. */
export const COVER_SIZE = 272;
export const COVER_RADIUS = 6;
/** Each grain is a square this wide. */
export const GRAIN_SIZE = 1.3;
/** Song change: grains get this much extra step, decaying linearly to 0 over `KICK_MS`. */
export const KICK_POINTS = 4;
export const KICK_MS = 420;
/** Still version (paused or reduced motion): steps taken off-screen before drawing. */
export const SETTLE_STEPS = 220;
/** The plan's "each frame" is a 60 Hz frame. Faster displays step at the same rate. */
export const STEP_MS = 1000 / 60;
/** Wash grid: 3-point cells over a square that covers the ring, scaled up smoothly. */
export const WASH_CELL = 3;
export const WASH_HALF = RING_OUTER;
export const WASH_CELLS = Math.ceil((2 * WASH_HALF) / WASH_CELL);
/** Width of the wash band around a nodal line: opacity is `peak * exp(-f^2 / 0.06)`. */
export const WASH_WIDTH = 0.06;

/** Fallback floor for the grain count when frames are slow (plan 5, "Risks"). */
export const MIN_GRAINS = Math.min(1500, figureTuning.grains);
/** Mean frame time above this (about 49 fps) counts as dropping frames. */
export const SLOW_FRAME_MS = 20.5;
/** Mean frame time below this, with cheap simulation steps, counts as headroom. */
export const FAST_FRAME_MS = 18;
/** A simulation step cheaper than this (ms) leaves room to raise quality again. */
export const CHEAP_WORK_MS = 3;
/** Frames per measuring window. */
export const WINDOW_FRAMES = 60;

const RING_INNER_SQ = RING_INNER * RING_INNER;
const RING_OUTER_SQ = RING_OUTER * RING_OUTER;

export type FigureParams = {
  /** `n`: number of lobes, 3 to 8. */
  lobes: number;
  /** `k = 2π / λ`, with `λ = 44 − 18 · energy` reference points. */
  k: number;
  /** Shimmer of settled grains, in reference points per step, already scaled by motion. */
  floor: number;
  /** Rotation speed in rad/s, already scaled by motion. */
  omega: number;
};

/** What the song drives (plan 5, "What the song drives"). */
export function figureParams(energy: number, bpm: number): FigureParams {
  const e = Number.isFinite(energy) ? Math.min(1, Math.max(0, energy)) : 0.5;
  const tempo = Number.isFinite(bpm) && bpm > 0 ? bpm : 120;
  const lambda = 44 - 18 * e;
  return {
    lobes: 3 + Math.round(5 * e),
    k: (2 * Math.PI) / lambda,
    floor: (0.08 + 0.3 * e) * MOTION_SCALE,
    omega: 0.03 * (tempo / 120) * MOTION_SCALE,
  };
}

/**
 * The pattern. Grains collect where this is zero.
 *
 *   f(r, θ) = cos(n · (θ + φ)) · sin(k · r) + 0.6 · sin(1.5 · k · r + 1)
 *
 * `x` and `y` are reference points from the centre.
 */
export function patternValue(x: number, y: number, lobes: number, k: number, phi: number): number {
  'worklet';
  const kr = k * Math.sqrt(x * x + y * y);
  return (
    Math.cos(lobes * (Math.atan2(y, x) + phi)) * Math.sin(kr) + 0.6 * Math.sin(1.5 * kr + 1)
  );
}

/** Scatters `count` grains uniformly over the ring. */
export function seedGrains(xs: Float32Array, ys: Float32Array, count: number): void {
  'worklet';
  for (let i = 0; i < count; i++) {
    const r = Math.sqrt(RING_INNER_SQ + Math.random() * (RING_OUTER_SQ - RING_INNER_SQ));
    const a = Math.random() * 2 * Math.PI;
    xs[i] = r * Math.cos(a);
    ys[i] = r * Math.sin(a);
  }
}

/**
 * One step for every grain: a random move in x and y of up to
 * `floor + 3.2 · |f| + kick` points. Far from a nodal line a grain moves a
 * lot, on a line it almost stops, which is what makes them settle. A step
 * that would leave the ring is discarded.
 *
 * Mutates `xs` and `ys` in place and allocates nothing.
 */
export function stepGrains(
  xs: Float32Array,
  ys: Float32Array,
  count: number,
  lobes: number,
  k: number,
  phi: number,
  floor: number,
  kick: number,
): void {
  'worklet';
  const base = floor + kick;
  const turn = lobes * phi;
  for (let i = 0; i < count; i++) {
    const x = xs[i];
    const y = ys[i];
    const kr = k * Math.sqrt(x * x + y * y);
    const f =
      Math.cos(lobes * Math.atan2(y, x) + turn) * Math.sin(kr) + 0.6 * Math.sin(1.5 * kr + 1);
    const reach = base + 3.2 * (f < 0 ? -f : f);
    const nx = x + (Math.random() * 2 - 1) * reach;
    const ny = y + (Math.random() * 2 - 1) * reach;
    const d = nx * nx + ny * ny;
    if (d >= RING_INNER_SQ && d <= RING_OUTER_SQ) {
      xs[i] = nx;
      ys[i] = ny;
    }
  }
}

/** Mean of `|f|` over the grains: near 0 when they sit on the nodal lines. */
export function meanAbsPattern(
  xs: Float32Array,
  ys: Float32Array,
  count: number,
  lobes: number,
  k: number,
  phi: number,
): number {
  let sum = 0;
  for (let i = 0; i < count; i++) sum += Math.abs(patternValue(xs[i], ys[i], lobes, k, phi));
  return count > 0 ? sum / count : 0;
}

/**
 * The wash on its coarse grid, at rotation 0, as premultiplied RGBA bytes
 * (`WASH_CELLS` x `WASH_CELLS`). Alpha is `exp(-f² / 0.06)` at full scale;
 * the figure applies the peak opacity when it draws, so the 8-bit grid keeps
 * its precision. Because `f` only depends on `θ + φ`, the figure turns this
 * one image instead of recomputing it every frame.
 */
export function washPixels(lobes: number, k: number, r: number, g: number, b: number): Uint8Array {
  const size = WASH_CELLS;
  const pixels = new Uint8Array(size * size * 4);
  for (let row = 0; row < size; row++) {
    const y = (row + 0.5) * WASH_CELL - WASH_HALF;
    for (let col = 0; col < size; col++) {
      const x = (col + 0.5) * WASH_CELL - WASH_HALF;
      const f = patternValue(x, y, lobes, k, 0);
      const alpha = Math.exp(-(f * f) / WASH_WIDTH);
      const at = (row * size + col) * 4;
      pixels[at] = Math.round(r * alpha);
      pixels[at + 1] = Math.round(g * alpha);
      pixels[at + 2] = Math.round(b * alpha);
      pixels[at + 3] = Math.round(255 * alpha);
    }
  }
  return pixels;
}
