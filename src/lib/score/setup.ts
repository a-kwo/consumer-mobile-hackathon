/**
 * The setup sequence: what happens between the tap on "set the scene" and the
 * first song. It gathers the signals one after another (place, weather, time,
 * calendar, pace), each really sensed where the device can and filled from a
 * demo scenario where it cannot, then starts the session and waits for the
 * first pick.
 *
 * Each step shows as working for at least `minStepMs`, and the last finding is
 * held for `doneHoldMs` before the sequence reports done, so it reads on
 * screen; and its signal has about `maxStepMs` before the demo source is used,
 * so the sequence always completes in a few seconds.
 *
 * Races: `run` is bumped by every begin, reset and stop; whatever an older run
 * was waiting for is ignored when it arrives.
 */
import type { Scene, Track } from '../../../convex/lib/validators';
import { reportError, TimerBag } from './async';
import { CONFIG, MESSAGES } from './config';
import { Store } from './store';
import type {
  SensingSnapshot,
  SessionSnapshot,
  SetupSnapshot,
  SetupStep,
  SetupStepId,
  SignalFinding,
  SignalId,
} from './types';

const TITLES: Record<SetupStepId, string> = {
  place: 'Finding where you are',
  weather: 'Checking the sky',
  time: 'Reading the clock',
  calendar: "Looking at what's next",
  pace: 'Feeling your pace',
  music: 'Choosing your first song',
};

const SIGNALS: readonly SignalId[] = ['place', 'weather', 'time', 'calendar', 'pace'];
const ORDER: readonly SetupStepId[] = [...SIGNALS, 'music'];

const freshSteps = (): SetupStep[] =>
  ORDER.map((id) => ({ id, status: 'waiting', title: TITLES[id], detail: null, source: null }));

const IDLE = (): SetupSnapshot => ({ status: 'idle', steps: freshSteps(), scene: null, error: null });

export type SetupDeps = {
  sensing: {
    getSnapshot(): SensingSnapshot;
    beginRun(): number;
    sense(signal: SignalId, budgetMs: number, run: number): Promise<SignalFinding | null>;
    activate(run: number): void;
    stop(): void;
  };
  session: {
    getSnapshot(): SessionSnapshot;
    start(): void;
    stop(): void;
  };
};

export class SetupController {
  readonly store = new Store<SetupSnapshot>(IDLE());

  private run = 0;
  private readonly timers = new TimerBag();
  /** True while `begin` stops the old session: that stop is part of starting over, not a cancel. */
  private restarting = false;
  /** The sequence has handed over to the session (the 'music' step began). */
  private sessionStarted = false;
  /** Set while the 'music' step waits for the first pick. */
  private awaitingPick: { run: number; since: number } | null = null;

  constructor(private readonly deps: SetupDeps) {}

  /** Runs the sequence from the top. Safe to call at any time: a sequence in progress, and any music, is replaced. */
  readonly begin = (): void => {
    this.sequence().catch((error: unknown) => {
      reportError('setup', error);
      this.store.set({ ...this.store.get(), status: 'failed', error: MESSAGES.setupFailed });
    });
  };

  /** Back to 'idle'. Abandons a sequence in progress; does not stop music that is already playing. */
  readonly reset = (): void => {
    const wasGathering = this.store.get().status === 'running' && !this.sessionStarted;
    this.cancel();
    // Sensors a half-finished sequence turned on have no session to turn them off.
    if (wasGathering) this.deps.sensing.stop();
    this.store.set(IDLE());
  };

  /** The session's `stop()` was called: a sequence in progress ends with it. */
  noteStop(): void {
    if (this.restarting || this.store.get().status === 'idle') return;
    const wasGathering = this.store.get().status === 'running' && !this.sessionStarted;
    this.cancel();
    if (wasGathering) this.deps.sensing.stop();
    this.store.set(IDLE());
  }

  /** The session chose its first song: the 'music' step has its finding. */
  notePick(track: Track, scene: Scene): void {
    const waiting = this.awaitingPick;
    if (!waiting || waiting.run !== this.run) return;
    this.awaitingPick = null;
    const run = waiting.run;
    const title = typeof track.title === 'string' ? track.title.trim() : '';
    const artist = typeof track.artist === 'string' ? track.artist.trim() : '';
    // The payoff: name the song. Without a title, say what it was tuned to.
    const detail = title
      ? artist
        ? `${title} · ${artist}`
        : title
      : track.bpm > 0
        ? `Tuning to ${Math.round(track.bpm)} BPM`
        : track.reason;
    const left = Math.max(0, CONFIG.setup.minStepMs - (Date.now() - waiting.since));
    void this.timers
      .sleep(left)
      .then(() => {
        if (run !== this.run) return null;
        this.setStep('music', { status: 'done', detail });
        this.store.patch({ scene });
        // Let the finding be read before the screen moves on.
        return this.timers.sleep(CONFIG.setup.doneHoldMs);
      })
      .then(() => {
        if (run === this.run && this.store.get().status === 'running') this.store.patch({ status: 'done' });
      });
  }

  /** The session changed: if it went idle, the setup it belonged to is over. */
  noteSession(session: SessionSnapshot): void {
    const { status } = this.store.get();
    if (session.status !== 'idle' || status === 'idle' || status === 'failed') return;
    // Gathering signals happens before the session starts; idle then is expected.
    if (status === 'running' && !this.sessionStarted) return;
    if (this.restarting) return;
    this.cancel();
    // 'failed' is for a session that could not start; one that ended later just ends.
    if (session.error && status === 'running') this.store.patch({ status: 'failed', error: session.error });
    else this.store.set(IDLE());
  }

  dispose(): void {
    this.cancel();
    this.store.set(IDLE());
  }

  // ---------------------------------------------------------------- internals

  private cancel(): void {
    this.run += 1;
    this.sessionStarted = false;
    this.awaitingPick = null;
    this.timers.clear();
  }

  private setStep(id: SetupStepId, patch: Partial<SetupStep>): void {
    const steps = this.store.get().steps.map((step) => (step.id === id ? { ...step, ...patch } : step));
    this.store.patch({ steps });
  }

  private async sequence(): Promise<void> {
    this.cancel();
    const run = this.run;
    const { sensing, session } = this.deps;
    // Starting over replaces whatever was playing.
    if (session.getSnapshot().status !== 'idle') {
      this.restarting = true;
      try {
        session.stop();
      } finally {
        this.restarting = false;
      }
    }
    const sensingRun = sensing.beginRun();
    this.store.set({ status: 'running', steps: freshSteps(), scene: null, error: null });

    for (const signal of SIGNALS) {
      this.setStep(signal, { status: 'working' });
      const since = Date.now();
      const finding = await sensing.sense(signal, CONFIG.setup.maxStepMs, sensingRun);
      if (run !== this.run) return;
      if (finding === null) {
        // Sensing was stopped from elsewhere: there is nothing to finish.
        this.store.set(IDLE());
        return;
      }
      const left = CONFIG.setup.minStepMs - (Date.now() - since);
      if (left > 0) await this.timers.sleep(left);
      if (run !== this.run) return;
      this.setStep(signal, { status: 'done', detail: finding.detail, source: finding.source });
      this.store.patch({ scene: sensing.getSnapshot().scene });
    }

    sensing.activate(sensingRun);
    this.setStep('music', { status: 'working' });
    this.sessionStarted = true;
    this.awaitingPick = { run, since: Date.now() };
    session.start();
  }
}
