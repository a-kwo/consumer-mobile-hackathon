/**
 * Walking speed from GPS, and the cadence it implies. Pure maths, no sensors.
 * This is the fallback for phones without a pedometer or without motion access.
 */

export type SpeedSample = {
  /** When the fix arrived, in milliseconds. */
  t: number;
  /** Metres per second. */
  mps: number;
};

export type SpeedOptions = {
  windowMs: number;
  /** How long after a fix the speed holds; past that it decays to zero. */
  graceMs: number;
};

/** True for a speed reading worth keeping: iOS reports -1 when it has none. */
export function isValidSpeed(mps: number | null | undefined): mps is number {
  return typeof mps === 'number' && Number.isFinite(mps) && mps >= 0;
}

/**
 * Mean speed over the window ending at `nowMs`, or null when the window holds
 * no fix. Location updates stop when the phone stops moving, so once the last
 * fix is older than `graceMs` the mean is scaled down, reaching zero as that
 * fix leaves the window.
 */
export function smoothedSpeed(
  samples: readonly SpeedSample[],
  nowMs: number,
  options: SpeedOptions,
): number | null {
  const windowStart = nowMs - options.windowMs;
  let sum = 0;
  let count = 0;
  let latest = -Infinity;
  for (const sample of samples) {
    if (sample.t <= windowStart || sample.t > nowMs) continue;
    sum += sample.mps;
    count += 1;
    if (sample.t > latest) latest = sample.t;
  }
  if (count === 0) return null;

  const mean = sum / count;
  const silenceMs = nowMs - latest;
  if (silenceMs <= options.graceMs) return mean;
  const decaySpan = options.windowMs - options.graceMs;
  if (decaySpan <= 0) return 0;
  return mean * Math.max(0, 1 - (silenceMs - options.graceMs) / decaySpan);
}

export type SpeedCadencePoint = { mps: number; spm: number };

/**
 * Estimates steps per minute from ground speed by interpolating along `curve`
 * (points in ascending speed). Below the first point the user is standing;
 * above `maxOnFootMps` they are riding something, which also counts as still.
 */
export function cadenceFromSpeed(
  mps: number,
  curve: readonly SpeedCadencePoint[],
  maxOnFootMps: number,
): number {
  if (!isValidSpeed(mps) || curve.length === 0) return 0;
  if (mps > maxOnFootMps) return 0;
  if (mps <= curve[0].mps) return curve[0].spm;
  for (let i = 1; i < curve.length; i++) {
    const low = curve[i - 1];
    const high = curve[i];
    if (mps <= high.mps) {
      const t = (mps - low.mps) / (high.mps - low.mps);
      return low.spm + t * (high.spm - low.spm);
    }
  }
  return curve[curve.length - 1].spm;
}
