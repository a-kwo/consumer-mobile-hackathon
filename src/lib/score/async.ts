/** Small async helpers for the engine. No React, no native modules. */

export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Timed out after ${ms} ms`);
    this.name = 'TimeoutError';
  }
}

/**
 * Owns the timers behind a controller's waits, so that stopping the controller
 * can cancel all of them at once. After `clear()` no timer of the bag is left
 * running: sleeps resolve right away and timeouts reject right away, and the
 * code that was waiting is expected to check its own cancel signal next.
 */
export class TimerBag {
  private readonly pending = new Map<ReturnType<typeof setTimeout>, () => void>();

  sleep(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(timer);
        resolve();
      }, ms);
      this.pending.set(timer, resolve);
    });
  }

  /**
   * Settles like `promise`, unless it has not settled after `ms` (or the bag is
   * cleared first), in which case it rejects with `TimeoutError`. The promise
   * itself keeps running; its late result is dropped.
   */
  withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const expire = () => reject(new TimeoutError(ms));
      const timer = setTimeout(() => {
        this.pending.delete(timer);
        expire();
      }, ms);
      this.pending.set(timer, expire);
      const settle = () => {
        clearTimeout(timer);
        this.pending.delete(timer);
      };
      promise.then(
        (value) => {
          settle();
          resolve(value);
        },
        (error: unknown) => {
          settle();
          reject(error);
        },
      );
    });
  }

  /** Cancels every pending wait and wakes whoever was waiting on it. */
  clear(): void {
    const entries = Array.from(this.pending);
    this.pending.clear();
    for (const [timer, wake] of entries) {
      clearTimeout(timer);
      wake();
    }
  }
}

/**
 * For errors the engine swallows so that a timer or sensor callback can never
 * take the app down: says so in development, stays silent in a release build.
 */
export function reportError(scope: string, error: unknown): void {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.warn(`[score] ${scope}:`, error);
  }
}
