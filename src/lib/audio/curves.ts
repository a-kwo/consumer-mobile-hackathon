/**
 * Equal-power crossfade curves. At every point of the fade the two gains
 * satisfy in² + out² = 1, so the combined loudness stays constant instead of
 * dipping in the middle the way a linear fade does.
 */

const clamp01 = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t);

/** Gain of the incoming song at progress `t` (0 to 1). */
export function equalPowerIn(t: number): number {
  return Math.sin((clamp01(t) * Math.PI) / 2);
}

/** Gain of the outgoing song at progress `t` (0 to 1). */
export function equalPowerOut(t: number): number {
  return Math.cos((clamp01(t) * Math.PI) / 2);
}

/** Volume of a ramp from `from` to `to` at progress `t`, along the curve for its direction. */
export function rampVolume(from: number, to: number, t: number): number {
  return to >= from
    ? from + (to - from) * equalPowerIn(t)
    : to + (from - to) * equalPowerOut(t);
}
