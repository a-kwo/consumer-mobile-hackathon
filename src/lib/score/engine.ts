/**
 * The engine: owns the audio players, identity, sensing, the live session and
 * replay, and runs the one timer that drives playback decisions.
 *
 * It is a plain object, created once by `ScoreProvider` and kept for the life
 * of the app, so playback survives navigation. React only reads its stores.
 *
 * Foreground only: when the app goes to the background the OS pauses the
 * players and the engine stops its timer and its sensors. When the app comes
 * back the timer restarts, sensors resume, and a song that did not resume by
 * itself is started again.
 */
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { AppState, type AppStateStatus, Platform } from 'react-native';

import { Crossfader } from '../audio/crossfader';
import { canUnloadPlayers, configureAudioMode, createDeckPlayer } from '../audio/player';
import { loadOrCreateDeviceId } from '../identity/device-id';
import { IdentityController } from '../identity/identity';
import { SensingController } from '../sensing/sensing';
import { reportError } from './async';
import { CONFIG } from './config';
import { ReplayController } from './replay';
import { SessionController } from './session';
import { Store } from './store';
import type { Backend, PlaybackProgress } from './types';

const isWeb = () => Platform.OS === 'web';

const NOT_PLAYING: PlaybackProgress = { positionMs: 0, durationMs: 0, isPlaying: false };

export class ScoreEngine {
  readonly identity: IdentityController;
  readonly sensing: SensingController;
  readonly session: SessionController;
  readonly replay: ReplayController;
  readonly progress = new Store<PlaybackProgress>(NOT_PLAYING);

  private readonly audio: Crossfader;
  private backend: Backend | null = null;
  private mounted = false;
  private foreground = true;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private subscriptions: (() => void)[] = [];
  private keepAwake = false;
  private keepAwakeQueue: Promise<void> = Promise.resolve();
  private audioModeSet = false;
  private stalledSince: number | null = null;
  private lastResumeAt = 0;

  constructor() {
    const getBackend = () => this.backend;
    const isForeground = () => this.mounted && this.foreground;
    this.audio = new Crossfader({ createPlayer: createDeckPlayer, canUnload: canUnloadPlayers() });
    this.identity = new IdentityController({ loadDeviceId: loadOrCreateDeviceId });
    this.sensing = new SensingController({ getBackend });
    this.session = new SessionController({
      audio: this.audio,
      sensing: this.sensing,
      identity: this.identity,
      getBackend,
      isForeground,
      onWillStart: () => this.replay.stop(),
    });
    this.replay = new ReplayController({
      audio: this.audio,
      getBackend,
      isForeground,
      onWillPlay: () => this.session.stop(),
    });
  }

  /** Hands the engine its connection to Convex. Called by the provider. */
  setBackend(backend: Backend | null): void {
    this.backend = backend;
    this.identity.setBackend(backend);
  }

  /** Called when the provider mounts. Safe to call again after `unmount()`. */
  mount(): void {
    if (this.mounted) return;
    this.mounted = true;
    this.foreground = isWeb() || AppState.currentState !== 'background';

    const appState = AppState.addEventListener('change', this.onAppState);
    this.subscriptions = [
      () => appState.remove(),
      this.session.store.subscribe(this.onActivity),
      this.replay.store.subscribe(this.onActivity),
    ];
    this.ensureAudioMode();
    this.identity.mount();
    this.sensing.mount();
    if (!this.foreground) this.sensing.suspend();
    this.onActivity();
  }

  /** Called when the provider unmounts: stops everything and releases the players. */
  unmount(): void {
    if (!this.mounted) return;
    this.mounted = false;
    this.session.dispose();
    this.replay.dispose();
    for (const unsubscribe of this.subscriptions) unsubscribe();
    this.subscriptions = [];
    this.stopTick();
    this.setKeepAwake(false);
    this.sensing.unmount();
    this.identity.unmount();
    this.audio.release();
    this.progress.set(NOT_PLAYING);
  }

  // ---------------------------------------------------------------- internals

  /**
   * Sets the audio session once. Nothing is activated or interrupted by this;
   * it only decides how playback behaves when it starts.
   */
  private ensureAudioMode(): void {
    if (this.audioModeSet) return;
    this.audioModeSet = true;
    configureAudioMode().catch(() => {
      this.audioModeSet = false;
    });
  }

  private get sessionActive(): boolean {
    return this.session.store.get().status !== 'idle';
  }

  private get replayActive(): boolean {
    return this.replay.store.get().status !== 'idle';
  }

  /** The session or the replay changed state: adjust the timer and the wake lock. */
  private readonly onActivity = (): void => {
    if (!this.mounted) return;
    const sessionActive = this.sessionActive;
    if (sessionActive || this.replayActive) this.ensureAudioMode();
    this.setKeepAwake(sessionActive || this.replayActive);
    this.syncTick();
  };

  private readonly onAppState = (state: AppStateStatus): void => {
    // "inactive" (a system sheet, the app switcher) still plays audio: only
    // "background" counts as away.
    // A hidden browser tab reports "background" too, but it keeps playing and
    // nothing pauses its audio, so on web the engine never stands down.
    const foreground = isWeb() || state !== 'background';
    if (foreground === this.foreground) return;
    this.foreground = foreground;
    if (foreground) this.sensing.resume();
    else this.sensing.suspend();
    this.stalledSince = null;
    this.syncTick();
  };

  /** The timer runs only while something is playing and the app is in the foreground. */
  private syncTick(): void {
    const active = this.sessionActive || this.replayActive;
    if (this.mounted && this.foreground && active) {
      if (this.tickTimer === null) this.tickTimer = setInterval(this.tick, CONFIG.engine.tickMs);
    } else {
      this.stopTick();
    }
    if (!active) this.progress.set(NOT_PLAYING);
  }

  private stopTick(): void {
    if (this.tickTimer !== null) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    this.stalledSince = null;
  }

  private readonly tick = (): void => {
    try {
      this.runTick();
    } catch (error) {
      // Never let a timer callback take the app down; the next tick tries again.
      reportError('tick', error);
    }
  };

  private runTick(): void {
    const now = Date.now();
    const starts = this.audio.startCount;
    let progress = this.audio.progress();

    this.session.tick(progress, now);
    this.replay.tick(progress);
    // A song was started during this tick: report the new one, not the old.
    if (this.audio.startCount !== starts) progress = this.audio.progress();

    const owned = this.session.hasCurrentTrack || this.replay.hasCurrentTrack;
    if (!owned || !progress.hasTrack) {
      this.stalledSince = null;
      this.progress.set(NOT_PLAYING);
      return;
    }

    // The song should be playing. If it stopped without ending (an interruption,
    // a route change, a return from the background), nudge the player.
    if (!progress.isPlaying && !progress.ended && !progress.failed) {
      if (this.stalledSince === null) this.stalledSince = now;
      const stalledMs = now - this.stalledSince;
      const sinceResumeMs = now - this.lastResumeAt;
      if (
        stalledMs >= CONFIG.audio.stallResumeAfterMs &&
        sinceResumeMs >= CONFIG.audio.stallRetryEveryMs
      ) {
        this.lastResumeAt = now;
        this.audio.resume();
      }
    } else {
      this.stalledSince = null;
    }

    this.progress.set({
      positionMs: progress.positionMs,
      durationMs: progress.durationMs,
      isPlaying: progress.isPlaying,
    });
  }

  /** Keeps the screen on while a live session or a replay runs. Calls are serialised. */
  private setKeepAwake(on: boolean): void {
    if (on === this.keepAwake) return;
    this.keepAwake = on;
    const tag = CONFIG.engine.keepAwakeTag;
    this.keepAwakeQueue = this.keepAwakeQueue
      .then(() => (on ? activateKeepAwakeAsync(tag) : deactivateKeepAwake(tag)))
      .catch(() => {
        // The wake lock is a nicety (and unsupported in some browsers).
      });
  }
}
