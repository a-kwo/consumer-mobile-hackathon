/**
 * Replay of logged songs, for the soundtrack and feed screens: plays a list
 * from a starting index to its end, crossfading between items.
 *
 * Preview URLs expire, so each item's URL is fetched just before it is needed
 * and never kept. Items without a preview are skipped. Nothing is logged.
 */
import type { DeckProgress } from '../audio/crossfader';
import { TUNING } from '../../../convex/tuning';
import { TimerBag } from './async';
import { CONFIG } from './config';
import { Store } from './store';
import {
  type FetchSignal,
  Transport,
  type TransportAudio,
  type TransportDelegate,
  type TransportItem,
} from './transport';
import type { Backend, ReplayItem, ReplaySnapshot } from './types';

type ReplayMeta = { index: number; item: ReplayItem };

export type ReplayDeps = {
  audio: TransportAudio;
  getBackend(): Backend | null;
  /** False while the app is in the background. */
  isForeground(): boolean;
  /** Called at the beginning of `play()`, before anything else: stops the live session. */
  onWillPlay(): void;
};

const IDLE: ReplaySnapshot = { listId: null, index: -1, item: null, status: 'idle' };

export class ReplayController implements TransportDelegate<ReplayMeta, null> {
  readonly store = new Store<ReplaySnapshot>(IDLE);

  private readonly transport: Transport<ReplayMeta, null>;
  private readonly timers = new TimerBag();
  private run = 0;
  private items: ReplayItem[] = [];
  /** Index of the next item to fetch. */
  private cursor = 0;

  constructor(private readonly deps: ReplayDeps) {
    this.transport = new Transport<ReplayMeta, null>(deps.audio, this, {
      prefetchLeadMs: TUNING.playback.prefetchLeadMs,
      tailMs: TUNING.playback.previewTailMs,
      crossfadeMs: TUNING.playback.crossfadeMs,
      canStartNow: deps.isForeground,
    });
  }

  /** True while an item of this replay is the current song. */
  get hasCurrentTrack(): boolean {
    return this.transport.current !== null;
  }

  /**
   * Plays `items` from `startIndex` through to the end of the list. Calling it
   * while a replay is running switches to the new list or position.
   */
  readonly play = (listId: string, items: readonly ReplayItem[], startIndex = 0): void => {
    const list = Array.isArray(items) ? items.slice() : [];
    const start = Number.isFinite(startIndex) ? Math.max(0, Math.floor(startIndex)) : 0;
    if (list.length === 0 || start >= list.length) {
      this.stop();
      return;
    }
    this.deps.onWillPlay();
    this.run += 1;
    this.items = list;
    this.cursor = start;
    this.store.set({ listId, index: start, item: list[start], status: 'loading' });
    this.transport.begin(null, CONFIG.audio.replayStartFadeMs);
  };

  readonly stop = (): void => {
    if (this.store.get().status === 'idle') return;
    this.run += 1;
    this.items = [];
    this.transport.stop(CONFIG.audio.stopFadeMs);
    this.timers.clear();
    this.store.set(IDLE);
  };

  /** Called by the engine a few times a second while the app is in the foreground. */
  tick(progress: DeckProgress): void {
    if (this.store.get().status === 'idle') return;
    this.transport.tick(progress);
  }

  dispose(): void {
    this.stop();
  }

  // ---------------------------------------------------------------- transport delegate

  /** Walks forward from the cursor to the next item that has a preview. */
  async fetch(_request: null, signal: FetchSignal): Promise<TransportItem<ReplayMeta> | null> {
    const run = this.run;
    const backend = this.deps.getBackend();
    if (!backend) return null;

    while (this.cursor < this.items.length) {
      const index = this.cursor;
      const item = this.items[index];
      this.cursor = index + 1;

      let previewUrl: string | null;
      try {
        const result = await this.timers.withTimeout(
          backend.preview({ deezerId: item.deezerId }),
          CONFIG.replay.previewTimeoutMs,
        );
        previewUrl = result.previewUrl;
      } catch {
        // Offline: skipping ahead would only fail the same way for every item.
        return null;
      }
      if (signal.cancelled || run !== this.run) return null;
      if (previewUrl) return { url: previewUrl, meta: { index, item } };
    }
    return null;
  }

  autoRequest(): null {
    return null;
  }

  onLoadFailed(): void {
    // The cursor has already moved on; the next fetch tries the following item.
  }

  onStarted(meta: ReplayMeta): void {
    this.store.patch({ index: meta.index, item: meta.item, status: 'playing' });
  }

  onFinished(): void {
    this.run += 1;
    this.items = [];
    this.timers.clear();
    this.store.set(IDLE);
  }

  onChange(): void {
    // Nothing in the replay snapshot depends on the pending state.
  }
}
