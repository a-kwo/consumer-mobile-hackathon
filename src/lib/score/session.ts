/**
 * The live scoring session: asks the backend for the song that fits the moment,
 * plays it, logs it, and decides when the moment has changed enough to move on.
 *
 * The mechanics of lining songs up and crossfading belong to `Transport`; this
 * file adds what is specific to scoring: building the request from the current
 * context, retrying when the backend or a preview fails, noticing a sharp
 * change in the context, skip, nudges, and the play log.
 *
 * Races: `run` is the generation counter. `start()` and every stop bump it, and
 * anything asynchronous that started under an older generation is ignored.
 */
import { buildScene } from '../../../convex/lib/scene';
import type { Nudge, PlayContext, Scene, Track } from '../../../convex/lib/validators';
import { TUNING } from '../../../convex/tuning';
import type { DeckProgress } from '../audio/crossfader';
import { TimerBag } from './async';
import { CONFIG, MESSAGES } from './config';
import { buildPickArgs, contextForPlay, retryDelayMs } from './request';
import { Store } from './store';
import {
  type FetchSignal,
  Transport,
  type TransportAudio,
  type TransportDelegate,
  type TransportItem,
} from './transport';
import type {
  Backend,
  NudgeDirection,
  PickResult,
  PlayId,
  SensingSnapshot,
  SessionSnapshot,
} from './types';

type PickRequest = {
  kind: 'start' | 'auto' | 'skip' | 'nudge' | 'change';
  /** Sent to the backend so the reason line can mention the tap. */
  nudge?: Nudge;
};

type PickMeta = {
  track: Track;
  /** The scene the server picked this song for. */
  scene: Scene;
  /** The context at pick time, as it will be stored with the play. */
  context: PlayContext;
  /** The energy bias that was sent with the request. */
  energyBias: number;
};

type CurrentPlay = {
  meta: PickMeta;
  /** `plays.log` has been called (or deliberately skipped). */
  logged: boolean;
  playId: Promise<PlayId | null> | null;
  skipped: boolean;
  failureCounted: boolean;
  /** It has played long enough to count as working. */
  healthy: boolean;
};

type FailureKind = 'network' | 'no_preview' | 'playback';

export type SessionDeps = {
  audio: TransportAudio;
  sensing: {
    getSnapshot(): SensingSnapshot;
    startLive(): Promise<void>;
    stopLive(): void;
    setEnergyBias(bias: number): void;
  };
  identity: {
    getDeviceId(): string | null;
    whenReady(): Promise<string>;
  };
  getBackend(): Backend | null;
  /** False while the app is in the background. */
  isForeground(): boolean;
  /** Called at the beginning of `start()`, before anything else: stops replay. */
  onWillStart(): void;
};

const IDLE: SessionSnapshot = {
  status: 'idle',
  track: null,
  scene: null,
  isLoadingNext: false,
  error: null,
  energyBias: 0,
  nudgePicksLeft: 0,
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export class SessionController implements TransportDelegate<PickMeta, PickRequest> {
  readonly store = new Store<SessionSnapshot>(IDLE);

  private readonly transport: Transport<PickMeta, PickRequest>;
  private readonly timers = new TimerBag();
  private run = 0;
  private currentPlay: CurrentPlay | null = null;
  /** Whether the current song had ended at the last tick. */
  private currentEnded = false;

  // Failure tracking, for backoff and for the message the user sees.
  private failures = 0;
  private lastFailure: FailureKind | null = null;
  private failedIds: number[] = [];

  // Sharp-change detection.
  private divergedSince: number | null = null;
  private lastTickAt = 0;
  private targetFor: { context: PlayContext; bias: number; energy: number } | null = null;

  constructor(private readonly deps: SessionDeps) {
    this.transport = new Transport<PickMeta, PickRequest>(deps.audio, this, {
      prefetchLeadMs: TUNING.playback.prefetchLeadMs,
      tailMs: TUNING.playback.previewTailMs,
      crossfadeMs: TUNING.playback.crossfadeMs,
      canStartNow: deps.isForeground,
    });
  }

  /** True while a song of this session is the current one. */
  get hasCurrentTrack(): boolean {
    return this.transport.current !== null;
  }

  // ---------------------------------------------------------------- controls

  /** Starts scoring. Does nothing unless the session is idle. */
  readonly start = (): void => {
    if (this.store.get().status !== 'idle') return;
    const run = ++this.run;
    this.deps.onWillStart();
    this.failures = 0;
    this.lastFailure = null;
    this.failedIds = [];
    this.currentPlay = null;
    this.divergedSince = null;
    this.lastTickAt = Date.now();
    this.deps.sensing.setEnergyBias(0);
    this.store.set({ ...IDLE, status: 'starting', isLoadingNext: true });
    void this.beginWhenSensorsAreUp(run);
  };

  /** Stops scoring: fades out, turns the sensors off, clears any error. */
  readonly stop = (): void => {
    if (this.store.get().status === 'idle') {
      this.store.patch({ error: null });
      return;
    }
    this.halt(null);
  };

  /** Marks the current song as skipped and moves to another one right away. */
  readonly skip = (): void => {
    if (this.store.get().status !== 'playing') return;
    const pendingRequest = this.transport.pendingRequest;
    if (this.transport.pendingImmediate && pendingRequest?.kind === 'skip') return;

    // A song that already played to its end was heard in full: it stays in the log.
    if (!this.currentEnded) this.markSkipped(this.currentPlay);
    this.allowAnotherAttempt();
    if (this.transport.startReadyNow(CONFIG.audio.skipFadeMs)) return;
    this.transport.request(
      { kind: 'skip', nudge: 'skip' },
      { immediate: true, fadeMs: CONFIG.audio.skipFadeMs },
    );
  };

  /**
   * Shifts the target energy one step for the next few picks and fetches a
   * song for the new target now.
   */
  readonly nudge = (direction: NudgeDirection): void => {
    if (this.store.get().status === 'idle') return;
    if (direction !== 'calmer' && direction !== 'more_energy') return;
    const step = direction === 'more_energy' ? TUNING.nudgeEnergyStep : -TUNING.nudgeEnergyStep;
    const shifted = Math.round((this.store.get().energyBias + step) * 100) / 100;
    const energyBias = clamp(shifted, -TUNING.maxEnergyBias, TUNING.maxEnergyBias);
    this.store.patch({ energyBias, nudgePicksLeft: energyBias === 0 ? 0 : TUNING.nudgePicks });
    this.deps.sensing.setEnergyBias(energyBias);
    this.allowAnotherAttempt();
    this.transport.request(
      { kind: 'nudge', nudge: direction },
      { immediate: true, fadeMs: TUNING.playback.crossfadeMs },
    );
  };

  /**
   * Called by the engine a few times a second while the app is in the
   * foreground, with the position of the current song.
   */
  tick(progress: DeckProgress, now: number): void {
    if (this.store.get().status === 'idle') return;
    const suspended = now - this.lastTickAt > CONFIG.engine.suspendedGapMs;
    this.lastTickAt = now;
    if (suspended) this.divergedSince = null;

    const play = this.currentPlay;
    const playing = this.transport.current;
    this.currentEnded = play !== null && progress.hasTrack && progress.ended;
    if (play && progress.hasTrack) {
      if (progress.failed) {
        if (!play.failureCounted) {
          play.failureCounted = true;
          this.noteFailure('playback');
        }
      } else {
        if (!play.logged && (progress.isPlaying || progress.positionMs > 0)) this.logPlay(play);
        if (!play.healthy && progress.positionMs >= CONFIG.session.healthyPlayMs) {
          // Once per song: failures from here on (a failing prefetch) count afresh.
          play.healthy = true;
          this.failures = 0;
          this.lastFailure = null;
          this.store.patch({ error: null });
        }
        this.watchForSharpChange(play, progress, now);
      }
    }
    // If the song changed just now, `progress` still describes the previous one.
    if (this.transport.current !== playing) return;
    this.transport.tick(progress);
  }

  /** Stops without ceremony when the provider unmounts. */
  dispose(): void {
    if (this.store.get().status !== 'idle') this.halt(null);
    this.timers.clear();
  }

  // ---------------------------------------------------------------- transport delegate

  async fetch(request: PickRequest, signal: FetchSignal): Promise<TransportItem<PickMeta> | null> {
    const run = this.run;
    const cancelled = () => signal.cancelled || run !== this.run;

    for (;;) {
      if (cancelled()) return null;
      if (this.failures >= CONFIG.session.giveUpAfter) {
        this.store.patch({ error: MESSAGES.gaveUp[this.lastFailure ?? 'network'] });
        return null;
      }
      const wait = retryDelayMs(this.failures);
      if (wait > 0) await this.timers.sleep(wait);
      if (cancelled()) return null;

      const deviceId = await this.deps.identity.whenReady();
      if (cancelled()) return null;

      const backend = this.deps.getBackend();
      if (!backend) {
        this.noteFailure('network');
        continue;
      }

      const { context } = this.deps.sensing.getSnapshot();
      const { energyBias, nudgePicksLeft } = this.store.get();
      const bias = nudgePicksLeft > 0 ? energyBias : 0;
      const args = buildPickArgs({
        deviceId,
        context,
        nudge: request.nudge,
        energyBias: bias,
        excludeDeezerIds: this.heldIds(),
      });

      let result: PickResult | null = null;
      try {
        result = await this.timers.withTimeout(backend.pick(args), CONFIG.session.pickTimeoutMs);
      } catch {
        result = null;
      }
      if (cancelled()) return null;

      if (result && result.track && result.track.previewUrl) {
        return {
          url: result.track.previewUrl,
          meta: {
            track: result.track,
            scene: result.scene,
            context: contextForPlay(context, result.scene),
            energyBias: bias,
          },
        };
      }
      if (result && result.error === 'empty_library') {
        this.store.patch({ error: MESSAGES.emptyLibrary });
        return null;
      }
      this.noteFailure(result ? 'no_preview' : 'network');
    }
  }

  autoRequest(): PickRequest {
    return { kind: 'auto' };
  }

  onLoadFailed(meta: PickMeta): void {
    this.failedIds.push(meta.track.deezerId);
    if (this.failedIds.length > CONFIG.session.rememberFailedIds) this.failedIds.shift();
    this.noteFailure('playback');
  }

  onStarted(meta: PickMeta): void {
    this.currentPlay = {
      meta,
      logged: false,
      playId: null,
      skipped: false,
      failureCounted: false,
      healthy: false,
    };
    this.currentEnded = false;
    this.divergedSince = null;
    this.targetFor = null;

    // A nudge lasts for a fixed number of songs; this one used one of them.
    let { energyBias, nudgePicksLeft } = this.store.get();
    if (meta.energyBias !== 0 && nudgePicksLeft > 0) {
      nudgePicksLeft -= 1;
      if (nudgePicksLeft === 0) energyBias = 0;
    }
    this.store.patch({
      status: 'playing',
      track: meta.track,
      scene: meta.scene,
      energyBias,
      nudgePicksLeft,
      // A message about a song that would not play stays until one plays properly.
      error: this.lastFailure === 'playback' ? this.store.get().error : null,
    });
    this.deps.sensing.setEnergyBias(energyBias);
  }

  onFinished(): void {
    // The transport ran dry: the library is empty or the retries were used up.
    this.halt(this.store.get().error ?? MESSAGES.gaveUp[this.lastFailure ?? 'network']);
  }

  onChange(): void {
    const { status } = this.store.get();
    if (status === 'idle') return;
    const pending = this.transport.pendingState;
    this.store.patch({
      // Until the first song is audible the session is, as a whole, loading.
      isLoadingNext: status === 'starting' || pending === 'fetching' || pending === 'loading',
    });
  }

  // ---------------------------------------------------------------- internals

  private async beginWhenSensorsAreUp(run: number): Promise<void> {
    if (this.deps.sensing.getSnapshot().mode === 'live') {
      try {
        await this.deps.sensing.startLive();
      } catch {
        // The session runs without sensors, at cadence zero.
      }
    }
    if (run !== this.run) return;
    this.transport.begin({ kind: 'start' }, CONFIG.audio.firstFadeInMs);
  }

  private halt(error: string | null): void {
    this.run += 1;
    this.transport.stop(CONFIG.audio.stopFadeMs);
    this.timers.clear();
    this.currentPlay = null;
    this.divergedSince = null;
    this.targetFor = null;
    this.deps.sensing.stopLive();
    this.deps.sensing.setEnergyBias(0);
    this.store.set({ ...IDLE, error });
  }

  /** Songs the backend should not return: the one playing and recent failures. */
  private heldIds(): number[] {
    const ids = new Set<number>(this.failedIds);
    const playing = this.transport.current;
    if (playing) ids.add(playing.track.deezerId);
    return Array.from(ids);
  }

  private noteFailure(kind: FailureKind): void {
    this.failures += 1;
    this.lastFailure = kind;
    if (this.failures >= CONFIG.session.surfaceErrorAfter && this.store.get().status !== 'idle') {
      this.store.patch({ error: MESSAGES.retrying[kind] });
    }
  }

  /** A tap earns one more attempt even after the session had given up. */
  private allowAnotherAttempt(): void {
    this.failures = Math.min(this.failures, CONFIG.session.giveUpAfter - 1);
  }

  private logPlay(play: CurrentPlay): void {
    play.logged = true;
    const backend = this.deps.getBackend();
    const deviceId = this.deps.identity.getDeviceId();
    if (!backend || !deviceId) return;
    const { meta } = play;
    play.playId = backend
      .logPlay({
        deviceId,
        deezerId: meta.track.deezerId,
        startedAt: Date.now(),
        context: meta.context,
        sceneKey: meta.scene.key,
        sceneLabel: meta.scene.label,
        reason: meta.track.reason,
      })
      .catch(() => null);
  }

  private markSkipped(play: CurrentPlay | null): void {
    if (!play || play.skipped) return;
    play.skipped = true;
    // Skipped before it was heard: it never enters the log at all.
    play.logged = true;
    const backend = this.deps.getBackend();
    const deviceId = this.deps.identity.getDeviceId();
    if (!play.playId || !backend || !deviceId) return;
    void play.playId
      .then((playId) => (playId ? backend.markSkipped({ deviceId, playId }) : null))
      .catch(() => null);
  }

  /**
   * Fetches a new song when the moment has moved away from the one the current
   * song was picked for: the target energy differs by more than `energyDelta`,
   * has done so without a break for `sustainMs`, and the song has had
   * `minPlayMs`. The target is computed with the bias the current song was
   * picked with, so that only a change in the context counts, never a nudge
   * wearing off.
   */
  private watchForSharpChange(play: CurrentPlay, progress: DeckProgress, now: number): void {
    // Once the song is over, the next one is already being brought in.
    if (progress.ended) return;
    const { context } = this.deps.sensing.getSnapshot();
    const bias = play.meta.energyBias;
    if (!this.targetFor || this.targetFor.context !== context || this.targetFor.bias !== bias) {
      this.targetFor = { context, bias, energy: targetEnergy(context, bias) };
    }

    const { energyDelta, sustainMs, minPlayMs, crossfadeMs } = TUNING.playback;
    if (Math.abs(this.targetFor.energy - play.meta.scene.energy) <= energyDelta) {
      this.divergedSince = null;
      return;
    }
    if (this.divergedSince === null) this.divergedSince = now;
    if (now - this.divergedSince < sustainMs) return;
    if (progress.positionMs < minPlayMs) return;
    // A skip, a nudge or an earlier change is already bringing a new song.
    if (this.transport.pendingImmediate) return;

    this.divergedSince = null;
    // The song lined up for the end of this one may already fit the new moment
    // (it was picked after the change began): then just bring it in now.
    const lined = this.transport.pendingMeta;
    if (lined) {
      const wanted = targetEnergy(context, lined.energyBias);
      if (Math.abs(wanted - lined.scene.energy) <= energyDelta) {
        this.transport.expedite(crossfadeMs);
        return;
      }
    }
    this.transport.request({ kind: 'change' }, { immediate: true, fadeMs: crossfadeMs });
  }
}

/** The energy `buildScene` targets for a context and an energy bias. */
function targetEnergy(context: PlayContext, energyBias: number): number {
  return buildScene({
    cadenceSpm: context.cadenceSpm,
    localHour: context.localHour,
    weather: context.weather,
    setting: context.setting,
    energyBias,
  }).energy;
}
