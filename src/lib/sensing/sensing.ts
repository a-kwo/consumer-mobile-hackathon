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
 *
 * The calendar (see ./calendar) is asked for only from `setCalendarEnabled(true)`
 * and read only in live mode. Known places (see ./places) never leave the phone.
 */
import * as Device from 'expo-device';
import * as Location from 'expo-location';
import { Pedometer } from 'expo-sensors';
import { Platform } from 'react-native';

import { type ActiveOccasion, type OccasionEvent, isOccasion, nextOccasion } from '../../../convex/lib/occasion';
import { buildScene } from '../../../convex/lib/scene';
import { SETTINGS, WEATHERS } from '../../../convex/lib/validators';
import { TUNING } from '../../../convex/tuning';
import { reportError, TimerBag } from '../score/async';
import { CONFIG, MESSAGES } from '../score/config';
import { reuseIfEqual, Store } from '../score/store';
import type {
  Backend,
  CalendarAccess,
  LiveReadings,
  PermissionState,
  SensingMode,
  SensingSnapshot,
  SimValues,
} from '../score/types';
import { CadenceWindow } from './cadence';
import { calendarAccess, loadCalendarEnabled, readOccasionEvents, storeCalendarEnabled } from './calendar';
import { liveContext, localHourOf, simulatedContext } from './context';
import { type Coordinates, distanceMeters, placeNameFrom } from './geo';
import {
  PLACE_KINDS,
  PLACE_SETTING,
  type PlaceKind,
  type SavedPlace,
  loadPlaces,
  placeAt,
  storePlaces,
  withPlace,
} from './places';
import { cadenceFromSpeed, isValidSpeed, smoothedSpeed, type SpeedSample } from './speed';

type Removable = { remove(): void };

export type SensingDeps = {
  getBackend: () => Backend | null;
};

const isWeb = () => Platform.OS === 'web';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** The device clock as a float hour rounded to the nearest quarter, for the simulator's default. */
function quarterHourOf(date: Date): number {
  return Math.round((date.getHours() + date.getMinutes() / 60) * 4) / 4;
}

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
  /** Until the user sets the simulator's hour, it follows the device clock. */
  private userSetSimHour = false;
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

  // Calendar occasions.
  private calendarEnabled = false;
  private calendarAccess: CalendarAccess = 'unknown';
  private calendarEvents: readonly OccasionEvent[] = [];
  private calendarReadAt = 0;
  private calendarReading = false;
  private occasionNotice: string | null = null;
  /** The backend refused the occasion arguments: picks go without them until the user tries again. */
  private occasionRefused = false;

  // Known places.
  private places: readonly SavedPlace[] = [];
  private savingPlace = false;
  private placeNotice: string | null = null;

  constructor(private readonly deps: SensingDeps) {
    const now = new Date();
    this.liveAvailable = !isWeb() && Device.isDevice;
    this.mode = this.liveAvailable ? 'live' : 'simulated';
    this.sim = {
      cadenceSpm: CONFIG.simulator.cadenceSpm,
      localHour: quarterHourOf(now),
      weather: CONFIG.simulator.weather,
      setting: CONFIG.simulator.setting,
      occasion: null,
      minutesUntil: CONFIG.simulator.minutesUntil,
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
    if (mode === 'live') {
      void this.startLive();
      this.maybeReadCalendar(true);
    } else this.stopLive();
  };

  readonly setSim = (patch: Partial<SimValues>): void => {
    const next: SimValues = { ...this.sim };
    if (typeof patch.cadenceSpm === 'number' && Number.isFinite(patch.cadenceSpm)) {
      next.cadenceSpm = clamp(Math.round(patch.cadenceSpm), 0, CONFIG.sensing.maxCadenceSpm);
    }
    if (typeof patch.localHour === 'number' && Number.isFinite(patch.localHour)) {
      next.localHour = clamp(patch.localHour, 0, 24);
      this.userSetSimHour = true;
    }
    // Unknown values are ignored: `buildScene` has no entry for them.
    if (patch.weather !== undefined && WEATHERS.includes(patch.weather)) {
      next.weather = patch.weather;
    }
    if (patch.setting !== undefined && SETTINGS.includes(patch.setting)) {
      next.setting = patch.setting;
    }
    const setsEvent = patch.occasion !== undefined || patch.minutesUntil !== undefined;
    if (patch.occasion === null || isOccasion(patch.occasion)) next.occasion = patch.occasion;
    if (typeof patch.minutesUntil === 'number' && Number.isFinite(patch.minutesUntil)) {
      next.minutesUntil = clamp(Math.round(patch.minutesUntil), 0, TUNING.occasion.leadMinutes);
    }
    // Choosing an event again is a fresh try at a backend that refused the last one.
    if (setsEvent) this.forgetOccasionRefusal();
    this.sim = reuseIfEqual(this.sim, next);
    this.publish();
  };

  /**
   * Turns reading the device calendar on or off. Turning it on asks for calendar
   * access (the first time); when that is refused the app carries on as before.
   */
  readonly setCalendarEnabled = (enabled: boolean): void => {
    void this.switchCalendar(enabled === true);
  };

  /** Tags where the phone is right now as a known place. Asks for location access if needed. */
  readonly savePlace = (kind: PlaceKind): void => {
    if (!PLACE_KINDS.includes(kind)) return;
    void this.tagPlace(kind);
  };

  readonly removePlace = (id: string): void => {
    const remaining = this.places.filter((place) => place.id !== id);
    if (remaining.length === this.places.length) return;
    this.places = remaining;
    void storePlaces(remaining);
    this.publish();
  };

  /** The backend would not take an occasion: picks go without one, and the user is told. */
  noteOccasionRefused(): void {
    this.occasionRefused = true;
    this.occasionNotice = MESSAGES.occasionUnsupported;
    this.publish();
  }

  /** A new session, or a new choice of event, tries the occasion again. */
  forgetOccasionRefusal(): void {
    if (!this.occasionRefused) return;
    this.occasionRefused = false;
    if (this.occasionNotice === MESSAGES.occasionUnsupported) this.occasionNotice = null;
    this.publish();
  }

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
    void this.restore();
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
    this.maybeReadCalendar(true);
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
    const now = Date.now();
    let occasion = this.activeOccasion(now);
    // A position is trusted while the sensors run, and for a while after a place was tagged.
    const located =
      this.running || now - this.coordinatesAt <= CONFIG.sensing.location.lastKnownMaxAgeMs;
    const herePlace = located ? placeAt(this.places, this.coordinates) : null;
    let context =
      this.mode === 'simulated'
        ? simulatedContext(this.sim, occasion?.id ?? null)
        : liveContext(
            this.live,
            this.coordinates,
            herePlace ? PLACE_SETTING[herePlace.kind] : 'any',
            occasion?.id ?? null,
          );
    let scene = buildScene({
      cadenceSpm: context.cadenceSpm,
      localHour: context.localHour,
      weather: context.weather,
      setting: context.setting,
      energyBias: this.energyBias,
      temperatureC: context.temperatureC ?? null,
      occasion: occasion?.id,
      minutesUntil: occasion?.minutesUntil,
    });
    if (previous) {
      context = reuseIfEqual(previous.context, context);
      scene = reuseIfEqual(previous.scene, scene);
      if (occasion && previous.occasion) occasion = reuseIfEqual(previous.occasion, occasion);
    }
    return {
      mode: this.mode,
      liveAvailable: this.liveAvailable,
      permissions: this.permissions,
      sim: this.sim,
      live: this.live,
      context,
      scene,
      occasion,
      calendarEnabled: this.calendarEnabled,
      calendarAccess: this.calendarAccess,
      occasionNotice: this.occasionNotice,
      places: this.places,
      herePlace,
      isSavingPlace: this.savingPlace,
      placeNotice: this.placeNotice,
    };
  }

  /** The simulator's event in simulated mode; the calendar's next one in live mode. */
  private activeOccasion(now: number): ActiveOccasion | null {
    if (this.occasionRefused) return null;
    if (this.mode === 'simulated') {
      const { occasion, minutesUntil } = this.sim;
      if (!occasion) return null;
      return { id: occasion, minutesUntil: minutesUntil ?? CONFIG.simulator.minutesUntil };
    }
    if (!this.calendarEnabled || this.calendarAccess !== 'granted') return null;
    return nextOccasion(this.calendarEvents, now);
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
      const now = new Date();
      this.setLive({ localHour: localHourOf(now) });
      if (!this.userSetSimHour) {
        this.sim = reuseIfEqual(this.sim, { ...this.sim, localHour: quarterHourOf(now) });
      }
      this.maybeReadCalendar();
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

  /** Reads what the user saved on this phone: known places and the calendar switch. Shows no prompt. */
  private async restore(): Promise<void> {
    const epoch = this.probeEpoch;
    const stale = () => !this.mounted || epoch !== this.probeEpoch;

    const [places, calendarEnabled] = await Promise.all([loadPlaces(), loadCalendarEnabled()]);
    if (stale()) return;
    // A place tagged while storage was being read is newer than anything in it.
    if (this.places.length === 0) this.places = places;
    if (calendarEnabled && !this.calendarEnabled) {
      const access = await calendarAccess(false);
      if (stale()) return;
      this.calendarAccess = access;
      this.calendarEnabled = access === 'granted';
    }
    this.publish();
    this.maybeReadCalendar(true);
  }

  // ---------------------------------------------------------------- calendar

  private async switchCalendar(enabled: boolean): Promise<void> {
    this.forgetOccasionRefusal();
    if (!enabled) {
      this.calendarEnabled = false;
      this.calendarEvents = [];
      this.occasionNotice = null;
      void storeCalendarEnabled(false);
      this.publish();
      return;
    }
    const access = await calendarAccess(true);
    this.calendarAccess = access;
    this.calendarEnabled = access === 'granted';
    if (access === 'granted') this.occasionNotice = null;
    else this.occasionNotice = access === 'unavailable' ? MESSAGES.calendarUnavailable : MESSAGES.calendarDenied;
    void storeCalendarEnabled(this.calendarEnabled);
    this.publish();
    this.maybeReadCalendar(true);
  }

  /**
   * Reads the calendar when it is in use: switched on, allowed, live mode, app in
   * front. Simulated mode never reads it. At most once per `calendarRefreshMs`
   * unless forced.
   */
  private maybeReadCalendar(force = false): void {
    if (!this.mounted || !this.appActive || this.mode !== 'live' || this.calendarReading) return;
    if (!this.calendarEnabled || this.calendarAccess !== 'granted') return;
    const now = Date.now();
    if (!force && now - this.calendarReadAt < CONFIG.sensing.calendarRefreshMs) return;
    this.calendarReading = true;
    this.calendarReadAt = now;
    readOccasionEvents(now)
      .then((events) => {
        this.calendarEvents = events;
        if (this.occasionNotice === MESSAGES.calendarUnreadable) this.occasionNotice = null;
      })
      .catch(() => {
        this.calendarEvents = [];
        this.occasionNotice = MESSAGES.calendarUnreadable;
      })
      .finally(() => {
        this.calendarReading = false;
        if (this.mounted) this.publish();
      });
  }

  // ---------------------------------------------------------------- known places

  private async tagPlace(kind: PlaceKind): Promise<void> {
    if (this.savingPlace) return;
    this.savingPlace = true;
    this.placeNotice = null;
    this.publish();
    const at = await this.locate();
    this.savingPlace = false;
    if (at) {
      this.places = withPlace(this.places, kind, at, Date.now());
      void storePlaces(this.places);
    } else {
      this.placeNotice = MESSAGES.placeNoFix;
    }
    this.publish();
  }

  /** Where the phone is now: the sensors' fix when they run, else a one-off position. Never rejects. */
  private async locate(): Promise<Coordinates | null> {
    if (this.running && this.coordinates) return this.coordinates;
    try {
      let permission = await Location.getForegroundPermissionsAsync();
      if (!permission.granted) permission = await Location.requestForegroundPermissionsAsync();
      this.setPermissions({ location: permission.granted ? 'granted' : 'denied' });
      if (!permission.granted) return null;
      const fix = await this.timers
        .withTimeout(
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
          CONFIG.sensing.placeFixTimeoutMs,
        )
        .catch(() =>
          Location.getLastKnownPositionAsync({ maxAge: CONFIG.sensing.location.lastKnownMaxAgeMs }),
        );
      if (!fix || !Number.isFinite(fix.coords.latitude) || !Number.isFinite(fix.coords.longitude)) {
        return null;
      }
      this.coordinates = { lat: fix.coords.latitude, lon: fix.coords.longitude };
      this.coordinatesAt = Date.now();
      return this.coordinates;
    } catch {
      return null;
    }
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
