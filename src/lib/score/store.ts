/**
 * A tiny observable store. The engine keeps all of its state in stores like
 * this one, outside React; hooks read them with `useSyncExternalStore`.
 */

export type Listener = () => void;

/** True when both objects have the same keys with `Object.is`-equal values. */
export function shallowEqual<T extends object>(a: T, b: T): boolean {
  if (a === b) return true;
  const aKeys = Object.keys(a) as (keyof T)[];
  if (aKeys.length !== Object.keys(b).length) return false;
  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(b, key) || !Object.is(a[key], b[key])) return false;
  }
  return true;
}

/** Returns `previous` when `next` is shallowly equal to it, so references stay stable. */
export function reuseIfEqual<T extends object>(previous: T, next: T): T {
  return shallowEqual(previous, next) ? previous : next;
}

export class Store<T extends object> {
  private state: T;
  private readonly listeners = new Set<Listener>();

  constructor(initial: T) {
    this.state = initial;
  }

  /** The current snapshot. The reference only changes when a field changed. */
  readonly get = (): T => this.state;

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Replaces the snapshot. Does nothing when no top-level field changed. */
  set(next: T): void {
    if (shallowEqual(this.state, next)) return;
    this.state = next;
    this.emit();
  }

  /** Merges the given fields into the snapshot. Does nothing when none changed. */
  patch(partial: Partial<T>): void {
    let changed = false;
    for (const key of Object.keys(partial) as (keyof T)[]) {
      if (!Object.is(partial[key], this.state[key])) {
        changed = true;
        break;
      }
    }
    if (!changed) return;
    this.state = { ...this.state, ...partial };
    this.emit();
  }

  private emit(): void {
    for (const listener of Array.from(this.listeners)) listener();
  }
}
