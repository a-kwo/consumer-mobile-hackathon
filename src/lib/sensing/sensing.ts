/**
 * Sensing and the simulator: holds the mode, the simulator values and the
 * live readings, and derives the context and scene the rest of the engine uses.
 *
 * Live sensors run only while they are wanted (a live session is running, or
 * the user switched to live mode) and the app is in the foreground. Permission
 * prompts appear only from `startLive()`, never at import or mount.
 *
 * Facts this relies on, from the SDK 58 docs and the installed package source:
 * - `Pedometer.watchStepCount` reports a running step total since the
 *   subscription began, in batches, and only in the foreground. On Android the
 *   first event is a baseline (it reports 1 without a step being taken).
 * - `Pedometer.isAvailableAsync()` is false on simulators and on web.
 * - `Location.watchPositionAsync` delivers foreground updates whose
 *   `coords.speed` is metres per second (negative on iOS when unknown).
 * - `Location.reverseGeocodeAsync` exists on iOS and Android only.
 */
import * as Device from 'expo-device';
import * as Location from 'expo-location';
import { Pedometer } from 'expo-sensors';
import { Platform } from 'react-native';

import { buildScene } from '../../../convex/lib/scene';
import { SETTINGS, WEATHERS } from '../../../convex/lib/validators';
import { TUNING } from '../../../convex/tuning';
import { reportError, TimerBag } from '../score/async';
import { CONFIG } from '../score/config';
import { reuseIfEqual, Store } from '../score/store';
import type {
  Backend,
  LiveReadings,
  PermissionState,
  SensingMode,
  SensingSnapshot,
  SimValues,
} from '../score/types';
import { CadenceWindow } from './cadence';
import { liveContext, localHourOf, simulatedContext } from './context';
import { type Coordinates, distanceMeters, placeNameFrom } from './geo';
import { cadenceFromSpeed, isValidSpeed, smoothedSpeed, type SpeedSample } from './speed';

type Removable = { remove(): void };

export type SensingDeps = {
  getBackend: () => Backend | null;
};

const isWeb = () => Platform.OS === 'web';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function toPermissionState(response: { granted: boolean; status: string }): PermissionState {
  if (response.granted) return 'granted';
  return response.status === 'denied' ? 'denied' : 'unknown';
}

export class SensingController {
  readonly store: Store<SensingSnapshot>;

  // What the snapshot is built from.
  private mode: SensingMode;
  private liveAvailable: boolean;
  private permissions: SensingSnapshot['permissions'] = { motion: 'unknown', location: 'unknown' };
  private sim: SimValues;
  private live: LiveReadings;
  private coordinates: Coordinates | null = null;
  /** When `coordinates` were fixed, in milliseconds. */
  private coordinatesAt = 0;
  private energyBias = 0;

  // Lifecycle.
  private mounted = false;
  private appActive = true;
  private userChoseMode = false;
  private probeEpoch = 0;
  private clockTimer: ReturnType<typeof setInterval> | null = null;
  private readonly timers = new TimerBag();

  // Live sensors.
  private pedometerAvailable: boolean | null = null;
  private wanted = false;
  private running = false;
  private starting: Promise<void> | null = null;
  private sensorEpoch = 0;
  private pedometerSubscription: Removable | null = null;
  private locationSubscription: Removable | null = null;
  private pedometerActive = false;
  private awaitingStepBaseline = false;
  private sampleTimer: ReturnType<typeof setInterval> | null = null;
  private speeds: SpeedSample[] = [];
  private readonly steps = new CadenceWindow({
    windowMs: TUNING.sensing.cadenceWindowMs,
    graceMs: CONFIG.sensing.cadenceGraceMs,
    minSpanMs: CONFIG.sensing.cadenceMinSpanMs,
    maxSpm: CONFIG.sensing.maxCadenceSpm,
  });

  // Throttles.
  private geocoding = false;
  private lastGeocode: (Coordinates & { at: number; named: boolean }) | null = null;
  private weatherInFlight = false;
  private weatherAttemptAt = 0;
  private lastWeather: (Coordinates & { at: number }) | null = null;

  constructor(private readonly deps: SensingDeps) {
    const now = new Date();
    this.liveAvailable = !isWeb() && Device.isDevice;
    this.mode = this.liveAvailable ? 'live' : 'simulated';
    this.sim = {
      cadenceSpm: CONFIG.simulator.cadenceSpm,
      localHour: now.getHours(),
      weather: CONFIG.simulator.weather,
      setting: CONFIG.simulator.setting,
    };
    this.live = {
      cadenceSpm: 0,
      speedMps: null,
      weather: 'any',
      temperatureC: null,
      placeName: null,
      localHour: localHourOf(now),
    };
    this.store = new Store(this.buildSnapshot(null));
  }

  // ---------------------------------------------------------------- public

  readonly getSnapshot = (): SensingSnapshot => this.store.get();

  /**
   * Switches between live sensors and simulator values. Switching to live asks
   * for motion and location access (once) and turns the sensors on.
   */
  readonly setMode = (mode: SensingMode): void => {
    if (mode !== 'live' && mode !== 'simulated') return;
    this.userChoseMode = true;
    this.mode = mode;
    this.publish();
    if (mode === 'live') void this.startLive();
    else this.stopLive();
  };

  readonly setSim = (patch: Partial<SimValues>): void => {
    const next: SimValues = { ...this.sim };
    if (typeof patch.cadenceSpm === 'number' && Number.isFinite(patch.cadenceSpm)) {
      next.cadenceSpm = clamp(Math.round(patch.cadenceSpm), 0, CONFIG.sensing.maxCadenceSpm);
    }
    if (typeof patch.localHour === 'number' && Number.isFinite(patch.localHour)) {
      next.localHour = clamp(patch.localHour, 0, 24);
    }
    // Unknown values are ignored: `buildScene` has no entry for them.
    if (patch.weather !== undefined && WEATHERS.includes(patch.weather)) {
      next.weather = patch.weather;
    }
    if (patch.setting !== undefined && SETTINGS.includes(patch.setting)) {
      next.setting = patch.setting;
    }
    this.sim = reuseIfEqual(this.sim, next);
    this.publish();
  };

  /** The session tells sensing about the nudge it carries, for the scene preview. */
  setEnergyBias(bias: number): void {
    if (bias === this.energyBias) return;
    this.energyBias = bias;
    this.publish();
  }

  /** Called when the provider mounts. Looks, without prompting, at what the phone offers. */
  mount(): void {
    if (this.mounted) return;
    this.mounted = true;
    this.refreshClock();
    this.clockTimer = setInterval(this.refreshClock, CONFIG.sensing.clockMs);
    void this.probe();
  }

  unmount(): void {
    if (!this.mounted) return;
    this.mounted = false;
    this.probeEpoch += 1;
    this.wanted = false;
    this.stopSensors();
    this.timers.clear();
    if (this.clockTimer !== null) clearInterval(this.clockTimer);
    this.clockTimer = null;
  }

  /** The app went to the background: sensors off, but remembered as wanted. */
  suspend(): void {
    this.appActive = false;
    this.stopSensors();
  }

  /** The app is in the foreground again. */
  resume(): void {
    this.appActive = true;
    this.refreshClock();
    // A start that is waiting on a permission prompt turns the sensors on itself.
    if (this.wanted && !this.starting) {
      this.startSensors().catch((error: unknown) => reportError('sensors', error));
    }
  }

  /**
   * Asks for motion and location access if needed, then turns the sensors on.
   * Resolves when they are on or cannot be turned on; never rejects.
   */
  startLive(): Promise<void> {
    this.wanted = true;
    if (!this.starting) {
      this.starting = this.runStart().finally(() => {
        this.starting = null;
      });
    }
    return this.starting;
  }

  /** Turns the sensors off and forgets the cadence and speed they reported. */
  stopLive(): void {
    this.wanted = false;
    this.stopSensors();
  }

  // ---------------------------------------------------------------- snapshot

  private buildSnapshot(previous: SensingSnapshot | null): SensingSnapshot {
    let context =
      this.mode === 'simulated'
        ? simulatedContext(this.sim)
        : liveContext(this.live, this.coordinates);
    let scene = buildScene({
      cadenceSpm: context.cadenceSpm,
      localHour: context.localHour,
      weather: context.weather,
      setting: context.setting,
      energyBias: this.energyBias,
      temperatureC: context.temperatureC ?? null,
    });
    if (previous) {
      context = reuseIfEqual(previous.context, context);
      scene = reuseIfEqual(previous.scene, scene);
    }
    return {
      mode: this.mode,
      liveAvailable: this.liveAvailable,
      permissions: this.permissions,
      sim: this.sim,
      live: this.live,
      context,
      scene,
    };
  }

  private publish(): void {
    this.store.set(this.buildSnapshot(this.store.get()));
  }

  private setLive(patch: Partial<LiveReadings>): void {
    this.live = reuseIfEqual(this.live, { ...this.live, ...patch });
  }

  private setPermissions(patch: Partial<SensingSnapshot['permissions']>): void {
    this.permissions = reuseIfEqual(this.permissions, { ...this.permissions, ...patch });
  }

  private readonly refreshClock = (): void => {
    try {
      this.setLive({ localHour: localHourOf(new Date()) });
      this.publish();
    } catch (error) {
      reportError('clock', error);
    }
  };

  // ---------------------------------------------------------------- availability

  /** Checks for a pedometer and reads the permission states. Shows no prompt. */
  private async probe(): Promise<void> {
    const epoch = ++this.probeEpoch;
    const stale = () => !this.mounted || epoch !== this.probeEpoch;

    const available = await this.checkPedometer();
    if (stale()) return;
    this.liveAvailable = available && !isWeb() && Device.isDevice;
    const canLeaveLive = !this.userChoseMode && !this.wanted && this.mode === 'live';
    if (!this.liveAvailable && canLeaveLive) this.mode = 'simulated';
    this.publish();

    if (available) {
      try {
        const motion = toPermissionState(await Pedometer.getPermissionsAsync());
        if (stale()) return;
        if (this.permissions.motion === 'unknown') this.setPermissions({ motion });
      } catch {
        // Stays unknown.
      }
    }
    try {
      const location = toPermissionState(await Location.getForegroundPermissionsAsync());
      if (stale()) return;
      if (this.permissions.location === 'unknown') this.setPermissions({ location });
    } catch {
      // Stays unknown (some browsers cannot say without asking).
    }
    this.publish();
  }

  private async checkPedometer(): Promise<boolean> {
    if (this.pedometerAvailable === null) {
      let available = false;
      if (!isWeb()) {
        try {
          available = await Pedometer.isAvailableAsync();
        } catch {
          available = false;
        }
      }
      this.pedometerAvailable = available;
    }
    return this.pedometerAvailable;
  }

  // ---------------------------------------------------------------- live sensors

  private async runStart(): Promise<void> {
    try {
      await this.requestPermissions();
      if (!this.wanted) return;
      await this.startSensors();
    } catch {
      // Sensing is best effort: the session runs without it, at cadence zero.
    }
  }

  /** Shows the system prompts the first time; afterwards it only reads the answer. */
  private async requestPermissions(): Promise<void> {
    if (await this.checkPedometer()) {
      try {
        const response = await Pedometer.requestPermissionsAsync();
        this.setPermissions({ motion: response.granted ? 'granted' : 'denied' });
      } catch {
        // Stays as it was; cadence falls back to GPS speed.
      }
    }
    try {
      const response = await Location.requestForegroundPermissionsAsync();
      this.setPermissions({ location: response.granted ? 'granted' : 'denied' });
    } catch {
      // Stays as it was; picks are made without coordinates.
    }
    this.publish();
  }

  private async startSensors(): Promise<void> {
    if (!this.wanted || !this.appActive || !this.mounted || this.running) return;
    this.running = true;
    const epoch = ++this.sensorEpoch;
    const now = Date.now();

    this.steps.reset();
    this.speeds = [];
    this.pedometerActive = false;
    // Coordinates from a much earlier session say nothing about where the user is now.
    if (now - this.coordinatesAt > CONFIG.sensing.location.lastKnownMaxAgeMs) {
      this.coordinates = null;
    }
    if (this.pedometerAvailable && this.permissions.motion === 'granted') {
      try {
        this.awaitingStepBaseline = Platform.OS === 'android';
        if (!this.awaitingStepBaseline) this.steps.add(now, 0);
        this.pedometerSubscription = Pedometer.watchStepCount(this.onSteps);
        this.pedometerActive = true;
      } catch {
        this.pedometerSubscription = null;
      }
    }

    this.sampleTimer = setInterval(this.sample, TUNING.sensing.sampleMs);
    this.sample();

    if (this.permissions.location !== 'granted') return;
    void this.seedFromLastKnown(epoch);
    try {
      const subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: CONFIG.sensing.location.timeIntervalMs,
          distanceInterval: CONFIG.sensing.location.distanceIntervalM,
          mayShowUserSettingsDialog: CONFIG.sensing.location.mayShowUserSettingsDialog,
        },
        this.onLocation,
        () => {},
      );
      if (epoch !== this.sensorEpoch) subscription.remove();
      else this.locationSubscription = subscription;
    } catch {
      // Location services are off or unavailable: no speed, no coordinates.
    }
  }

  private stopSensors(): void {
    this.sensorEpoch += 1;
    this.running = false;
    for (const subscription of [this.pedometerSubscription, this.locationSubscription]) {
      try {
        subscription?.remove();
      } catch {
        // Already removed.
      }
    }
    this.pedometerSubscription = null;
    this.locationSubscription = null;
    if (this.sampleTimer !== null) clearInterval(this.sampleTimer);
    this.sampleTimer = null;
    this.pedometerActive = false;
    this.awaitingStepBaseline = false;
    this.steps.reset();
    this.speeds = [];
    this.setLive({ cadenceSpm: 0, speedMps: null });
    this.publish();
  }

  private readonly onSteps = (result: { steps: number }): void => {
    if (!this.running) return;
    const now = Date.now();
    if (this.awaitingStepBaseline) {
      this.awaitingStepBaseline = false;
      this.steps.reset();
      this.steps.add(now, result.steps);
      return;
    }
    this.steps.add(now, result.steps);
    this.sample();
  };

  private readonly onLocation = (location: Location.LocationObject): void => {
    if (!this.running) return;
    try {
      const now = Date.now();
      const { latitude, longitude, speed } = location.coords;
      if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
        this.coordinates = { lat: latitude, lon: longitude };
        this.coordinatesAt = now;
      }
      if (isValidSpeed(speed)) this.speeds.push({ t: now, mps: speed });
      this.afterFix(now);
    } catch (error) {
      reportError('location', error);
    }
    this.sample();
  };

  /** Uses a recent last known position for weather and place before the first real fix. */
  private async seedFromLastKnown(epoch: number): Promise<void> {
    try {
      const last = await Location.getLastKnownPositionAsync({
        maxAge: CONFIG.sensing.location.lastKnownMaxAgeMs,
      });
      // A fix from the watch always wins: it is newer than anything remembered.
      if (!last || epoch !== this.sensorEpoch || this.coordinates) return;
      this.coordinates = { lat: last.coords.latitude, lon: last.coords.longitude };
      this.coordinatesAt = Date.now();
      this.afterFix(Date.now());
      this.publish();
    } catch {
      // No last known position; the first fix will do.
    }
  }

  /** Recomputes cadence, speed and the clock, and publishes them. Never throws. */
  private readonly sample = (): void => {
    if (!this.running) return;
    try {
      this.takeSample();
    } catch (error) {
      reportError('sample', error);
    }
  };

  private takeSample(): void {
    const now = Date.now();
    const windowMs = TUNING.sensing.cadenceWindowMs;
    this.speeds = this.speeds.filter((entry) => entry.t > now - windowMs);
    const speed = smoothedSpeed(this.speeds, now, {
      windowMs,
      graceMs: CONFIG.sensing.cadenceGraceMs,
    });
    const cadence = this.pedometerActive
      ? this.steps.cadenceAt(now)
      : speed === null
        ? 0
        : cadenceFromSpeed(speed, CONFIG.sensing.speedToCadence, CONFIG.sensing.maxOnFootMps);
    this.setLive({
      cadenceSpm: Math.round(cadence),
      speedMps: speed === null ? null : Math.round(speed * 10) / 10,
      localHour: localHourOf(new Date(now)),
    });
    this.publish();
  }

  private afterFix(now: number): void {
    this.maybeGeocode(now);
    this.maybeFetchWeather(now);
  }

  /** Names the place: on the first fix, then after moving, at most once a minute. */
  private maybeGeocode(now: number): void {
    const at = this.coordinates;
    if (isWeb() || this.geocoding || !at) return;
    const last = this.lastGeocode;
    if (last) {
      if (now - last.at < CONFIG.sensing.geocodeMinIntervalMs) return;
      const moved = distanceMeters(last, at) >= CONFIG.sensing.geocodeMinDistanceM;
      if (last.named && !moved) return;
    }
    this.geocoding = true;
    const attempt = { ...at, at: now, named: false };
    this.lastGeocode = attempt;
    Location.reverseGeocodeAsync({ latitude: at.lat, longitude: at.lon })
      .then((results) => {
        const placeName = placeNameFrom(results[0]);
        if (!placeName) return;
        attempt.named = true;
        this.setLive({ placeName });
        this.publish();
      })
      .catch(() => {
        // Tried again after the minimum interval.
      })
      .finally(() => {
        this.geocoding = false;
      });
  }

  /** Fetches the weather: on the first fix, then when it is stale or the user has travelled. */
  private maybeFetchWeather(now: number): void {
    const at = this.coordinates;
    const backend = this.deps.getBackend();
    if (!backend || this.weatherInFlight || !at) return;
    const last = this.lastWeather;
    const due =
      !last ||
      now - last.at >= TUNING.weatherCacheMs ||
      distanceMeters(last, at) >= CONFIG.sensing.weatherRefreshDistanceM;
    if (!due || now - this.weatherAttemptAt < CONFIG.sensing.weatherRetryMs) return;

    this.weatherInFlight = true;
    this.weatherAttemptAt = now;
    this.timers
      .withTimeout(backend.weather({ lat: at.lat, lon: at.lon }), CONFIG.sensing.weatherTimeoutMs)
      .then((report) => {
        // `any` means the backend could not tell: keep what we have and ask again soon.
        if (report.weather === 'any') return;
        this.lastWeather = { ...at, at: Date.now() };
        this.setLive({ weather: report.weather, temperatureC: report.temperatureC });
        this.publish();
      })
      .catch(() => {
        // Tried again after the retry interval.
      })
      .finally(() => {
        this.weatherInFlight = false;
      });
  }
}
