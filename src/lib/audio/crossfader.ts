/**
 * Two audio players behind one interface: load the next song on the idle
 * player, then fade from the playing one to it.
 *
 * At any moment one deck is "current" (the song the app is presenting) and the
 * other is the "standby": empty, holding a prepared next song, or playing out
 * the tail of the previous song while it fades.
 *
 * Each deck carries its own volume ramp, so a crossfade is simply a fade-in on
 * one deck and a fade-out on the other. That keeps every combination safe: a
 * new song can be prepared while a stop is still fading out, and a fade-out can
 * start while the song is still fading in.
 *
 * No React and no native imports here: the players are injected, which is also
 * what makes this file testable.
 */
import { CONFIG } from '../score/config';
import { rampVolume } from './curves';

/** The part of a native status event the crossfader reads. */
export type DeckStatus = {
  isLoaded: boolean;
  didJustFinish: boolean;
  error: string | null;
};

/** Where a player is. Times are in seconds; `duration` is zero while unknown. */
export type DeckPosition = {
  currentTime: number;
  duration: number;
  playing: boolean;
};

/** The part of an expo-audio `AudioPlayer` the crossfader uses. */
export interface DeckPlayer {
  readonly isLoaded: boolean;
  readonly playing: boolean;
  readonly currentTime: number;
  readonly duration: number;
  /**
   * Position, duration and playing state in one read. On Android every native
   * read waits for the main thread, so one read per tick beats three. Optional:
   * without it the three properties above are read instead.
   */
  readonly currentStatus?: DeckPosition;
  volume: number;
  play(): void;
  pause(): void;
  replace(source: string | null): void;
  addListener(
    event: 'playbackStatusUpdate',
    listener: (status: DeckStatus) => void,
  ): { remove(): void };
  release(): void;
}

export type PrepareResult = 'ready' | 'failed' | 'cancelled';

/** Where the current song is. All zeros and false when nothing has been started. */
export type DeckProgress = {
  hasTrack: boolean;
  positionMs: number;
  durationMs: number;
  isPlaying: boolean;
  /** The song played to its end. */
  ended: boolean;
  /** The player reported an error while playing it. */
  failed: boolean;
};

export const NO_PROGRESS: DeckProgress = {
  hasTrack: false,
  positionMs: 0,
  durationMs: 0,
  isPlaying: false,
  ended: false,
  failed: false,
};

export type CrossfaderOptions = {
  createPlayer: () => DeckPlayer;
  /**
   * Whether `replace(null)` unloads a player. True on iOS and Android; on web
   * it would point the audio element at a bogus URL, so decks are only paused.
   */
  canUnload: boolean;
};

type Ramp = {
  from: number;
  to: number;
  startedAt: number;
  durationMs: number;
  onDone: (() => void) | null;
};

type Waiter = {
  settle: (result: PrepareResult) => void;
};

type Deck = {
  player: DeckPlayer;
  subscription: { remove(): void };
  url: string | null;
  load: 'empty' | 'loading' | 'ready' | 'failed';
  /** `play()` has been called for the loaded url. */
  started: boolean;
  finished: boolean;
  failed: boolean;
  /** The volume last written to the player. */
  volume: number;
  ramp: Ramp | null;
  waiter: Waiter | null;
};

export class Crossfader {
  private decks: [Deck, Deck] | null = null;
  private current = 0;
  private rampTimer: ReturnType<typeof setInterval> | null = null;
  private starts = 0;

  constructor(private readonly options: CrossfaderOptions) {}

  /** Goes up by one every time a prepared song is started. */
  get startCount(): number {
    return this.starts;
  }

  /**
   * Loads `url` on the standby deck, silently, and resolves once it can play.
   * Whatever the standby deck held is dropped, including the fading tail of the
   * previous song. Resolves `'cancelled'` when something else takes the deck
   * before the load finishes. Never rejects.
   */
  prepare(url: string, timeoutMs: number): Promise<PrepareResult> {
    let deck: Deck;
    try {
      deck = this.ensureDecks()[1 - this.current];
    } catch {
      return Promise.resolve('failed');
    }
    this.resetDeck(deck);
    deck.url = url;
    deck.load = 'loading';
    try {
      this.setVolume(deck, 0, true);
      deck.player.replace(url);
    } catch {
      this.resetDeck(deck);
      return Promise.resolve('failed');
    }

    return new Promise<PrepareResult>((resolve) => {
      const poll = setInterval(() => this.checkLoaded(deck), CONFIG.audio.loadPollMs);
      const timeout = setTimeout(() => waiter.settle('failed'), timeoutMs);
      const waiter: Waiter = {
        settle: (result) => {
          if (deck.waiter !== waiter) return;
          deck.waiter = null;
          clearInterval(poll);
          clearTimeout(timeout);
          if (result === 'ready') deck.load = 'ready';
          else if (result === 'failed') deck.load = 'failed';
          resolve(result);
        },
      };
      deck.waiter = waiter;
    });
  }

  /** True when the standby deck holds a song that is loaded and not yet started. */
  get hasPrepared(): boolean {
    const deck = this.decks?.[1 - this.current];
    return !!deck && deck.load === 'ready' && !deck.started;
  }

  /** Drops a song that was prepared (or is still loading) but never started. */
  discardPrepared(): void {
    const deck = this.decks?.[1 - this.current];
    if (deck && deck.url !== null && !deck.started) this.resetDeck(deck);
  }

  /**
   * Starts the prepared song and makes it the current one, fading it in over
   * `fadeMs` while the previous song fades out. When the fade completes the old
   * deck is paused and unloaded. Returns false when no song is prepared.
   */
  startPrepared(fadeMs: number): boolean {
    const decks = this.decks;
    if (!decks) return false;
    const next = decks[1 - this.current];
    const previous = decks[this.current];
    if (next.load !== 'ready' || next.url === null || next.started) return false;

    const fade = fadeMs > 0;
    try {
      // Written unconditionally: on web a newly loaded source starts at full volume.
      this.setVolume(next, fade ? 0 : 1, true);
      next.player.play();
    } catch {
      this.resetDeck(next);
      return false;
    }
    next.started = true;
    next.finished = false;
    next.failed = false;
    this.current = 1 - this.current;
    this.starts += 1;
    if (fade) this.startRamp(next, 1, fadeMs, null);

    if (previous.url !== null) {
      const fadingOut = previous.ramp !== null && previous.ramp.to === 0;
      const audible = previous.started && !previous.finished && !previous.failed;
      if (fadingOut) {
        // A stop is already taking it down; that ramp unloads it when done.
      } else if (fade && audible) {
        this.startRamp(previous, 0, fadeMs, () => this.resetDeck(previous));
      } else {
        this.resetDeck(previous);
      }
    }
    return true;
  }

  /** Fades out whatever is audible, then pauses and unloads both decks. */
  fadeOutAndStop(fadeMs: number): void {
    const decks = this.decks;
    if (!decks) return;
    for (const deck of decks) {
      if (deck.url === null) continue;
      const audible = deck.started && !deck.finished && !deck.failed && deck.volume > 0;
      if (!audible || fadeMs <= 0) {
        this.resetDeck(deck);
        continue;
      }
      // A deck that is already on its way out keeps its fade if that one ends sooner.
      const ramp = deck.ramp;
      const leftMs = ramp && ramp.to === 0 ? ramp.startedAt + ramp.durationMs - Date.now() : Infinity;
      if (leftMs > fadeMs) this.startRamp(deck, 0, fadeMs, () => this.resetDeck(deck));
    }
  }

  /** Position of the current song, read straight from its player. */
  progress(): DeckProgress {
    const deck = this.decks?.[this.current];
    if (!deck || deck.url === null || !deck.started) return NO_PROGRESS;

    let positionMs = 0;
    let durationMs = 0;
    let isPlaying = false;
    try {
      const status = deck.player.currentStatus ?? deck.player;
      positionMs = toMs(status.currentTime);
      durationMs = toMs(status.duration);
      isPlaying = status.playing === true;
    } catch {
      // A released or broken player reads as stopped at zero.
    }
    if (!(durationMs > 0)) durationMs = CONFIG.audio.fallbackDurationMs;

    // Backup for a missed finish event: stopped, and at the end. (Position zero
    // never counts, so a song that has not got going yet cannot look finished.)
    const atEnd = positionMs > 0 && positionMs >= durationMs - CONFIG.audio.endEpsilonMs;
    const ended = deck.finished || (!isPlaying && atEnd);
    return {
      hasTrack: true,
      positionMs: Math.min(positionMs, durationMs),
      durationMs,
      isPlaying: isPlaying && !ended && !deck.failed,
      ended,
      failed: deck.failed,
    };
  }

  /**
   * Calls `play()` again on the current song if it stopped without finishing:
   * after an interruption, a route change, or a return from the background.
   */
  resume(): void {
    const deck = this.decks?.[this.current];
    if (!deck || deck.url === null || !deck.started || deck.finished || deck.failed) return;
    try {
      if (!deck.player.playing) deck.player.play();
    } catch {
      // Nothing to resume.
    }
  }

  /** Stops everything and releases the native players. Safe to call twice. */
  release(): void {
    const decks = this.decks;
    this.decks = null;
    this.current = 0;
    this.stopRampTimer();
    if (!decks) return;
    for (const deck of decks) {
      this.resetDeck(deck);
      try {
        deck.subscription.remove();
      } catch {
        // Already removed.
      }
      try {
        deck.player.release();
      } catch {
        // Already released.
      }
    }
  }

  // ---------------------------------------------------------------- internals

  private ensureDecks(): [Deck, Deck] {
    if (!this.decks) {
      const first = this.createDeck();
      let second: Deck;
      try {
        second = this.createDeck();
      } catch (error) {
        first.subscription.remove();
        first.player.release();
        throw error;
      }
      this.decks = [first, second];
      this.current = 0;
    }
    return this.decks;
  }

  private createDeck(): Deck {
    const player = this.options.createPlayer();
    const deck: Deck = {
      player,
      subscription: { remove: () => {} },
      url: null,
      load: 'empty',
      started: false,
      finished: false,
      failed: false,
      volume: 1,
      ramp: null,
      waiter: null,
    };
    deck.subscription = player.addListener('playbackStatusUpdate', (status) =>
      this.onStatus(deck, status),
    );
    return deck;
  }

  private onStatus(deck: Deck, status: DeckStatus): void {
    if (deck.url === null) return;
    if (status.error) {
      if (deck.load === 'loading') deck.waiter?.settle('failed');
      else if (deck.started) deck.failed = true;
      return;
    }
    if (deck.load === 'loading') {
      // The event may describe the previous source; the property never does.
      if (status.isLoaded) this.checkLoaded(deck);
    } else if (deck.started && status.didJustFinish) {
      deck.finished = true;
    }
  }

  private checkLoaded(deck: Deck): void {
    if (!deck.waiter) return;
    let loaded = false;
    try {
      loaded = deck.player.isLoaded === true;
    } catch {
      deck.waiter.settle('failed');
      return;
    }
    if (loaded) deck.waiter.settle('ready');
  }

  /** Empties a deck: cancels its ramp and its pending load, pauses it, unloads it. */
  private resetDeck(deck: Deck): void {
    deck.ramp = null;
    deck.waiter?.settle('cancelled');
    const hadSource = deck.url !== null;
    deck.url = null;
    deck.load = 'empty';
    deck.started = false;
    deck.finished = false;
    deck.failed = false;
    if (!hadSource) return;
    try {
      deck.player.pause();
      if (this.options.canUnload) deck.player.replace(null);
    } catch {
      // The player is gone; there is nothing left to stop.
    }
  }

  private setVolume(deck: Deck, volume: number, force = false): void {
    const next = volume <= 0 ? 0 : volume >= 1 ? 1 : volume;
    if (!force && Math.abs(next - deck.volume) < 0.001) return;
    deck.volume = next;
    try {
      deck.player.volume = next;
    } catch {
      // The player is gone.
    }
  }

  private startRamp(deck: Deck, to: number, durationMs: number, onDone: (() => void) | null): void {
    deck.ramp = { from: deck.volume, to, startedAt: Date.now(), durationMs, onDone };
    if (this.rampTimer === null) {
      this.rampTimer = setInterval(() => this.stepRamps(), CONFIG.audio.fadeStepMs);
    }
  }

  private stepRamps(): void {
    const decks = this.decks;
    if (decks) {
      // Wall-clock based, so a fade interrupted by a suspension finishes at once on return.
      const now = Date.now();
      for (const deck of decks) {
        const ramp = deck.ramp;
        if (!ramp) continue;
        const t = (now - ramp.startedAt) / ramp.durationMs;
        if (t >= 1) {
          deck.ramp = null;
          this.setVolume(deck, ramp.to, true);
          ramp.onDone?.();
        } else {
          this.setVolume(deck, rampVolume(ramp.from, ramp.to, t));
        }
      }
    }
    if (!this.decks || !this.decks.some((deck) => deck.ramp !== null)) this.stopRampTimer();
  }

  private stopRampTimer(): void {
    if (this.rampTimer !== null) {
      clearInterval(this.rampTimer);
      this.rampTimer = null;
    }
  }
}

function toMs(seconds: number): number {
  return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : 0;
}
