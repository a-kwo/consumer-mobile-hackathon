/**
 * Motion tokens. Motion in Score is gentle and purposeful: fades between
 * states, a cover that breathes on the beat, bars that show playback is live.
 *
 * Durations are milliseconds. Easings are CSS timing-function names, which
 * react-native-reanimated 4 accepts directly in `transitionTimingFunction`
 * and `animationTimingFunction`.
 *
 * Reduced motion: components keep their fades (a dissolve is the accessible
 * substitute for movement) and drop anything that scales, pulses or loops.
 */
export const motion = {
  duration: {
    /** Press feedback. */
    press: 120,
    fast: 160,
    /** Default for state changes: selection, toggles, colour. */
    base: 240,
    slow: 420,
    /** The ambient wash and cover crossfade, matched to the 2 s audio crossfade. */
    ambient: 2000,
  },
  easing: {
    standard: 'ease-in-out',
    out: 'ease-out',
    linear: 'linear',
  },
  /** Scale applied to a control while it is pressed. */
  pressScale: 0.96,
  /** Peak scale of the cover art on the beat. */
  pulseScale: 1.035,
} as const;

/** BPM range the cover pulse will follow. Outside it, the pulse folds to half or double time. */
export const PULSE_BPM_RANGE = { min: 50, max: 130 } as const;

/**
 * Milliseconds per pulse for a song tempo. Fast songs pulse in half time and
 * very slow ones in double time, so the motion stays calm at any tempo.
 */
export function beatDurationMs(bpm: number): number {
  let tempo = Number.isFinite(bpm) && bpm > 0 ? bpm : 90;
  while (tempo > PULSE_BPM_RANGE.max) tempo /= 2;
  while (tempo < PULSE_BPM_RANGE.min) tempo *= 2;
  return Math.round(60000 / tempo);
}
