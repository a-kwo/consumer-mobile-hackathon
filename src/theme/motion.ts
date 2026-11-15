/**
 * Motion tokens. The kit itself is nearly still: controls ease when pressed,
 * selections slide, covers dissolve. The one moving thing in Score is the
 * cymatic figure on the Now screen, which is not part of the kit.
 *
 * Durations are milliseconds. Easings are CSS timing-function names, which
 * react-native-reanimated 4 accepts directly in `transitionTimingFunction`
 * and `animationTimingFunction`.
 *
 * Reduced motion: components keep their dissolves and drop anything that
 * scales or loops.
 */
export const motion = {
  duration: {
    /** Press feedback. */
    press: 120,
    fast: 160,
    /** Default for state changes: selection, toggles, colour. */
    base: 240,
    slow: 420,
    /** The cover crossfade on Now, matched to the 2 s audio crossfade. */
    ambient: 2000,
  },
  easing: {
    standard: 'ease-in-out',
    out: 'ease-out',
    linear: 'linear',
  },
  /** Scale applied to a control while it is pressed. */
  pressScale: 0.96,
  /** @deprecated The cover no longer pulses. Kept so existing code compiles. */
  pulseScale: 1,
} as const;

/** BPM range `beatDurationMs` folds a tempo into. */
export const PULSE_BPM_RANGE = { min: 50, max: 130 } as const;

/**
 * Milliseconds per beat for a song tempo, folded into a calm range: fast songs
 * count in half time and very slow ones in double time.
 */
export function beatDurationMs(bpm: number): number {
  let tempo = Number.isFinite(bpm) && bpm > 0 ? bpm : 90;
  while (tempo > PULSE_BPM_RANGE.max) tempo /= 2;
  while (tempo < PULSE_BPM_RANGE.min) tempo *= 2;
  return Math.round(60000 / tempo);
}
