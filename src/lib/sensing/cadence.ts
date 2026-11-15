/**
 * Step cadence from pedometer updates. Pure maths, no sensors.
 *
 * A pedometer reports a running step total, in batches that arrive every few
 * seconds and lag behind the feet. Cadence is the number of steps inside a
 * sliding window divided by the time they span. The total is interpolated
 * between updates, so a batch that straddles the edge of the window is counted
 * in proportion instead of all or nothing.
 */

export type StepSample = {
  /** When the update arrived, in milliseconds. */
  t: number;
  /** Running step total at that moment. */
  steps: number;
};

export type CadenceOptions = {
  /** Length of the sliding window. */
  windowMs: number;
  /**
   * How long after an update the cadence holds its value. Past that, the
   * silence counts as standing still and the cadence decays, reaching zero when
   * the last update leaves the window.
   */
  graceMs: number;
  /** Shortest span to divide by, so the first batch cannot produce a spike. */
  minSpanMs: number;
  /** Upper bound on the result. */
  maxSpm: number;
};

/** The running step total at time `t`, interpolated linearly between samples. */
export function stepsAt(samples: readonly StepSample[], t: number): number {
  if (samples.length === 0) return 0;
  if (t <= samples[0].t) return samples[0].steps;
  for (let i = 1; i < samples.length; i++) {
    const before = samples[i - 1];
    const after = samples[i];
    if (t <= after.t) {
      const span = after.t - before.t;
      if (span <= 0) return after.steps;
      return before.steps + ((t - before.t) / span) * (after.steps - before.steps);
    }
  }
  return samples[samples.length - 1].steps;
}

/** Steps per minute at `nowMs`, from samples in ascending time order. */
export function cadenceFromSteps(
  samples: readonly StepSample[],
  nowMs: number,
  options: CadenceOptions,
): number {
  if (samples.length < 2) return 0;
  const first = samples[0];
  const last = samples[samples.length - 1];
  const windowStart = nowMs - options.windowMs;
  if (last.t <= windowStart) return 0;

  const start = Math.max(windowStart, first.t);
  const end = Math.max(last.t, nowMs - options.graceMs);
  const steps = last.steps - stepsAt(samples, start);
  if (!(steps > 0)) return 0;

  const spanMs = Math.max(end - start, options.minSpanMs);
  return Math.min(options.maxSpm, (steps / spanMs) * 60000);
}

/** Keeps just enough pedometer history to compute the cadence. */
export class CadenceWindow {
  private samples: StepSample[] = [];

  constructor(private readonly options: CadenceOptions) {}

  reset(): void {
    this.samples = [];
  }

  /** Records a running step total. A total that went down starts a new count. */
  add(t: number, steps: number): void {
    if (!Number.isFinite(steps) || !Number.isFinite(t)) return;
    const last = this.samples[this.samples.length - 1];
    if (last && (steps < last.steps || t < last.t)) this.samples = [];
    this.samples.push({ t, steps });
    this.prune(t);
  }

  cadenceAt(nowMs: number): number {
    this.prune(nowMs);
    return cadenceFromSteps(this.samples, nowMs, this.options);
  }

  /** Drops samples older than the window, keeping one before it to interpolate from. */
  private prune(nowMs: number): void {
    const windowStart = nowMs - this.options.windowMs;
    while (this.samples.length > 1 && this.samples[1].t <= windowStart) this.samples.shift();
  }
}
