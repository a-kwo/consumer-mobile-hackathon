/**
 * The sequencing logic shared by the live session and by replay: keep one song
 * playing, line the next one up, and move to it at the right moment.
 *
 * A transport holds at most one "pending" next item. It is fetched (through
 * the delegate), loaded on the crossfader's standby deck, and then started:
 *   - when the current song has `tailMs` left (the normal crossfade),
 *   - at once, if the request was marked immediate (skip, nudge, sharp change),
 *   - at once, if the current song already ended or failed.
 * Transitions happen in `tick()`, which the engine calls a few times a second
 * and only while the app is in the foreground; in `startReadyNow()`, for taps;
 * and the moment an immediate item finishes loading, if the app is in the
 * foreground.
 *
 * Every asynchronous step belongs to one pending object; replacing or stopping
 * marks that object cancelled, and its late results are dropped.
 */
import type { DeckProgress, PrepareResult } from '../audio/crossfader';
import { reportError } from './async';
import { CONFIG } from './config';

export type TransportPhase = 'idle' | 'starting' | 'playing';
export type PendingState = 'none' | 'fetching' | 'loading' | 'ready';

export type FetchSignal = { readonly cancelled: boolean };

export type TransportItem<Meta> = { url: string; meta: Meta };

/** The part of the crossfader a transport drives. */
export interface TransportAudio {
  prepare(url: string, timeoutMs: number): Promise<PrepareResult>;
  discardPrepared(): void;
  startPrepared(fadeMs: number): boolean;
  fadeOutAndStop(fadeMs: number): void;
}

export interface TransportDelegate<Meta, Request> {
  /**
   * Produces the next item to play. Resolves null when there is nothing (more)
   * to play: the current song then plays out and `onFinished` follows. Retries
   * and backoff are the delegate's business; it should give up promptly once
   * `signal.cancelled` is true. A rejection is treated like null.
   */
  fetch(request: Request, signal: FetchSignal): Promise<TransportItem<Meta> | null>;
  /** The request to use when the transport lines the next item up by itself. */
  autoRequest(): Request;
  /** The item's audio could not be loaded or started; `fetch` is called again. */
  onLoadFailed(meta: Meta): void;
  /** Playback of the item has been started. */
  onStarted(meta: Meta, request: Request): void;
  /** Nothing is playing and nothing more will come. The transport is idle. */
  onFinished(): void;
  /** The phase or the pending state changed. */
  onChange(): void;
}

export type TransportTiming = {
  /** Line the next item up when the current one has this much left. */
  prefetchLeadMs: number;
  /** Start the crossfade when the current one has this much left. */
  tailMs: number;
  crossfadeMs: number;
  /**
   * False while the app is in the background, where nothing may start playing.
   * An immediate item that becomes ready then waits for the first tick after
   * the app returns.
   */
  canStartNow(): boolean;
};

type Pending<Meta, Request> = {
  request: Request;
  immediate: boolean;
  fadeMs: number;
  state: 'fetching' | 'loading' | 'ready';
  item: TransportItem<Meta> | null;
  cancelled: boolean;
};

export class Transport<Meta, Request> {
  private phaseValue: TransportPhase = 'idle';
  private currentMeta: Meta | null = null;
  private pending: Pending<Meta, Request> | null = null;
  /** The delegate has nothing more; finish when the current song is over. */
  private exhausted = false;

  constructor(
    private readonly audio: TransportAudio,
    private readonly delegate: TransportDelegate<Meta, Request>,
    private readonly timing: TransportTiming,
  ) {}

  get phase(): TransportPhase {
    return this.phaseValue;
  }

  /** The item that is playing, or null. */
  get current(): Meta | null {
    return this.currentMeta;
  }

  get pendingState(): PendingState {
    return this.pending ? this.pending.state : 'none';
  }

  get pendingRequest(): Request | null {
    return this.pending ? this.pending.request : null;
  }

  /** The pending item, once it has been fetched (while it loads or waits). */
  get pendingMeta(): Meta | null {
    return this.pending && this.pending.item ? this.pending.item.meta : null;
  }

  /** True when the pending item will start as soon as it is ready. */
  get pendingImmediate(): boolean {
    return this.pending !== null && this.pending.immediate;
  }

  /**
   * Starts a new sequence with `request`. Whatever is audible keeps playing
   * until the first item is ready and is then faded out under it.
   */
  begin(request: Request, fadeMs: number): void {
    this.cancelPending();
    this.phaseValue = 'starting';
    this.currentMeta = null;
    this.exhausted = false;
    this.launch(request, true, fadeMs);
  }

  /** Stops the sequence and fades the audio out. */
  stop(fadeMs: number): void {
    const wasIdle = this.phaseValue === 'idle';
    this.cancelPending();
    this.phaseValue = 'idle';
    this.currentMeta = null;
    this.exhausted = false;
    if (!wasIdle) {
      this.audio.fadeOutAndStop(fadeMs);
      this.delegate.onChange();
    }
  }

  /**
   * Replaces the pending item with a new request. With `immediate`, the new
   * item starts as soon as it has loaded, crossfading over `fadeMs`.
   */
  request(request: Request, options: { immediate: boolean; fadeMs: number }): void {
    if (this.phaseValue === 'idle') return;
    this.cancelPending();
    this.launch(request, options.immediate, options.fadeMs);
  }

  /** Starts the pending item right now if it is ready. Returns whether it did. */
  startReadyNow(fadeMs: number): boolean {
    const pending = this.pending;
    if (this.phaseValue === 'idle' || !pending || pending.state !== 'ready') return false;
    return this.transition(pending, fadeMs);
  }

  /**
   * Makes the pending item immediate: it starts as soon as it is ready instead
   * of waiting for the tail of the current song. Returns false when nothing is
   * pending.
   */
  expedite(fadeMs: number): boolean {
    const pending = this.pending;
    if (this.phaseValue === 'idle' || !pending) return false;
    pending.immediate = true;
    pending.fadeMs = fadeMs;
    if (pending.state === 'ready' && this.timing.canStartNow()) this.transition(pending, fadeMs);
    return true;
  }

  /** Decides, from where the current song is, whether to fetch or to switch. */
  tick(progress: DeckProgress): void {
    if (this.phaseValue === 'idle') return;
    const pending = this.pending;
    // "Over" means this sequence has nothing audible: no song yet, or it ended or broke.
    const over =
      this.currentMeta === null || !progress.hasTrack || progress.ended || progress.failed;
    const remainingMs = over ? 0 : progress.durationMs - progress.positionMs;

    if (pending) {
      if (pending.state !== 'ready') return;
      if (pending.immediate) {
        this.transition(pending, pending.fadeMs);
      } else if (over) {
        this.transition(pending, CONFIG.audio.gapFadeInMs);
      } else if (remainingMs <= this.timing.tailMs) {
        this.transition(pending, this.timing.crossfadeMs);
      }
      return;
    }

    if (over) {
      if (this.exhausted) this.finish();
      else this.launch(this.delegate.autoRequest(), true, CONFIG.audio.gapFadeInMs);
    } else if (!this.exhausted && remainingMs <= this.timing.prefetchLeadMs) {
      this.launch(this.delegate.autoRequest(), false, this.timing.crossfadeMs);
    }
  }

  // ---------------------------------------------------------------- internals

  private cancelPending(): void {
    const pending = this.pending;
    if (!pending) return;
    pending.cancelled = true;
    this.pending = null;
    if (pending.state !== 'fetching') this.audio.discardPrepared();
  }

  private launch(request: Request, immediate: boolean, fadeMs: number): void {
    const pending: Pending<Meta, Request> = {
      request,
      immediate,
      fadeMs,
      state: 'fetching',
      item: null,
      cancelled: false,
    };
    this.pending = pending;
    this.exhausted = false;
    this.delegate.onChange();
    this.run(pending).catch((error: unknown) => {
      // A bug in a delegate must not leave the sequence waiting forever on a
      // request nobody is working on: drop it and let the sequence wind down.
      reportError('transport', error);
      pending.cancelled = true;
      if (this.pending !== pending) return;
      this.pending = null;
      this.exhausted = true;
      this.audio.discardPrepared();
      try {
        this.delegate.onChange();
      } catch {
        // The delegate is what failed; the next tick finishes the sequence.
      }
    });
  }

  /** Fetches and loads until an item is ready, the delegate has none, or it is cancelled. */
  private async run(pending: Pending<Meta, Request>): Promise<void> {
    const signal: FetchSignal = {
      get cancelled() {
        return pending.cancelled;
      },
    };
    for (;;) {
      let item: TransportItem<Meta> | null = null;
      try {
        item = await this.delegate.fetch(pending.request, signal);
      } catch {
        item = null;
      }
      if (pending.cancelled) return;

      if (!item) {
        this.pending = null;
        this.exhausted = true;
        this.delegate.onChange();
        // With no song of this sequence playing there is nothing to wait for.
        // Finishing here, not in the next tick, means it also happens while
        // the tick is not running (the app is in the background).
        if (this.currentMeta === null) this.finish();
        return;
      }

      pending.item = item;
      pending.state = 'loading';
      this.delegate.onChange();
      const result = await this.audio.prepare(item.url, CONFIG.audio.loadTimeoutMs);
      if (pending.cancelled) return;

      if (result === 'ready') {
        pending.state = 'ready';
        this.delegate.onChange();
        // No need to wait for the next tick when the user is waiting for this one.
        if (pending.immediate && this.timing.canStartNow()) {
          this.transition(pending, pending.fadeMs);
        }
        return;
      }
      if (result === 'cancelled') {
        // Something else took the deck. Drop the request; the next tick starts over.
        this.pending = null;
        this.delegate.onChange();
        return;
      }

      pending.item = null;
      pending.state = 'fetching';
      this.delegate.onLoadFailed(item.meta);
      if (pending.cancelled) return;
      this.delegate.onChange();
    }
  }

  private transition(pending: Pending<Meta, Request>, fadeMs: number): boolean {
    const item = pending.item;
    this.pending = null;
    pending.cancelled = true;
    if (!item || !this.audio.startPrepared(fadeMs)) {
      if (item) this.delegate.onLoadFailed(item.meta);
      this.delegate.onChange();
      return false;
    }
    this.currentMeta = item.meta;
    this.phaseValue = 'playing';
    this.delegate.onStarted(item.meta, pending.request);
    this.delegate.onChange();
    return true;
  }

  private finish(): void {
    this.phaseValue = 'idle';
    this.currentMeta = null;
    this.pending = null;
    this.exhausted = false;
    this.audio.fadeOutAndStop(0);
    this.delegate.onChange();
    this.delegate.onFinished();
  }
}
