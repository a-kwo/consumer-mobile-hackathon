/**
 * Sensing: gathers the five signals a pick is made from (place, weather, time,
 * calendar, pace) and derives the context and scene from them.
 *
 * There is one mode. Each signal comes from the device when the device or
 * browser provides it and the user allows it; otherwise from a demo scenario
 * (see ./scenarios), so the app is fully usable on the web build and on
 * simulators. Every signal records its source, 'device' or 'demo'. A scenario
 * chosen outright through `demo.choose(id)` overrides the device: that is the
 * presenter's control.
 *
 * Nothing is asked of the user at import or mount. Permission prompts appear
 * only from the `sense*` methods, which the setup sequence (and a plain
 * `start()`) call after a tap. Sensors run from then until `stop()`, and only
 * while the app is in the foreground.
 *
 * Facts this relies on, from the SDK 58 docs and the installed package source:
 * - `Pedometer.watchStepCount` reports a running step total since the
 *   subscription began, in batches, and only in the foreground. On Android the
 *   first event is a baseline (it reports 1 without a step being taken).
 * - `Pedometer.isAvailableAsync()` is false on simulators and on web.
 * - `Location.watchPositionAsync` delivers foreground updates whose
 *   `coords.speed` is metres per second (negative on iOS when unknown).
 * - On web, expo-location uses the browser's geolocation: asking for a
 *   position is what shows the prompt, and the user may never answer it.
 *
 * Known places (see ./places) never leave the phone.
 */
import * as Device from 'expo-device';
import * as Location from 'expo-location';
import { Pedometer } from 'expo-sensors';
import { Platform } from 'react-native';

import { isOccasion, nextOccasion } from '../../../convex/lib/occasion';
import { buildScene } from '../../../convex/lib/scene';
import {
  type Occasion,
  type PlayContext,
  type Setting,
  SETTINGS,
  type Weather,
  WEATHERS,
} from '../../../convex/lib/validators';
import { TUNING } from '../../../convex/tuning';
import { reportError, TimerBag } from '../score/async';
import { CONFIG, MESSAGES } from '../score/config';
import { reuseIfEqual, Store } from '../score/store';
import type {
  Backend,
  CalendarAccess,
  LiveReadings,
  ScoreOccasion,
  SensingSnapshot,
  SignalFinding,
  SignalId,
  SignalSource,
} from '../score/types';
import { CadenceWindow } from './cadence';
import {
  calendarAccess,
  readOccasionEvents,
  storeCalendarEnabled,
  type TitledOccasionEvent,
} from './calendar';
import { localHourOf, placeForSetting } from './context';
import { type Coordinates, distanceMeters } from './geo';
import {
  type LocationStatus,
  type PlaceResult,
  type ScoreLocation,
  loadChosenLocation,
  placeNameOf,
  storeChosenLocation,
  toLocation,
} from './location';
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
import { demoCadence, type Scenario, scenarioById, SCENARIOS } from './scenarios';
import { cadenceFromSpeed, isValidSpeed, smoothedSpeed, type SpeedSample } from './speed';
import { describeOccasion, describePace, describeTime, describeWeather } from './wording';

type Removable = { remove(): void };

export type SensingDeps = {
  getBackend: () => Backend | null;
};

/**
 * Fixed signal values, for tests and tooling only: while set, no sensor and no
 * scenario is consulted and the context is built from these. Not part of the
 * app's public surface.
 */
export type SignalOverride = {
  cadenceSpm?: number;
  weather?: Weather;
  localHour?: number;
  setting?: Setting;
  occasion?: Occasion | null;
  minutesUntil?: number;
};

const isWeb = () => Platform.OS === 'web';
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const DEMO_LIST = SCENARIOS.map(({ id, label }) => ({ id, label }));

function scenarioLocation(scenario: Scenario): ScoreLocation | null {
  return scenario.place ? { ...scenario.place, setting: scenario.setting, source: 'demo' } : null;
}

export class SensingController {
  readonly store: Store<SensingSnapshot>;

  private permissions: SensingSnapshot['permissions'] = { motion: 'unknown', location: 'unknown' };
  private energyBias = 0;
  private override: Required<SignalOverride> | null = null;

  // Lifecycle.
  private mounted = false;
  private appActive = true;
  private restoreEpoch = 0;
  private clockTimer: ReturnType<typeof setInterval> | null = null;
  private readonly timers = new TimerBag();
  /** Bumped by `stop()` and by each new run: results of an older run are dropped. */
  private runEpoch = 0;
  /** The signals have been gathered and are being kept up to date. */
  private active = false;

  // Demo scenarios.
  /**
   * The scenario that overrides the device: the presenter's choice, or, until
   * the presenter chooses, the default one on a demo environment (a simulator,
   * an emulator, a cloud device, the web build). Null on a real phone.
   */
  private chosenScenario: Scenario | null = null;
  /** The presenter has chosen (a scenario, or none): the default no longer applies this session. */
  private scenarioChosenByUser = false;
  /** Fills this run's gaps; taken from the rotation the first time a gap appears. */
  private runScenario: Scenario | null = null;
  private rotation = 0;
  /** When the scenario in use was adopted: its event counts down from here. */
  private scenarioSince = 0;
  /** Signals of this run that had no real source and use the run's scenario. */
  private gaps = { place: false, weather: false, calendar: false, pace: false };

  // Place.
  /** A place the user picked from a search. */
  private pinned: ScoreLocation | null = null;
  /** Whether the pinned place or the chosen scenario was set last; the later one names the place. */
  private pinnedIsNewer = false;
  /** Where the device is, named through the backend. */
  private deviceLocation: ScoreLocation | null = null;
  private coordinates: Coordinates | null = null;
  private coordinatesAt = 0;
  private locationStatus: LocationStatus = 'idle';
  /** Bumped by every locate, choose and clear: older lookups are dropped. */
  private locationEpoch = 0;
  private placeLookupInFlight = false;
  private lastLookup: (Coordinates & { at: number; named: boolean }) | null = null;

  // Weather.
  private weather: (Coordinates & { weather: Weather; temperatureC: number | null; at: number }) | null =
    null;
  private weatherAttempt: (Coordinates & { at: number }) | null = null;
  private weatherToken = 0;

  // Calendar.
  private calendarEnabled = false;
  /** The user switched the calendar off: setup does not ask again this launch. */
  private calendarDeclined = false;
  private calendarAccess: CalendarAccess = 'unknown';
  private calendarEvents: readonly TitledOccasionEvent[] = [];
  private calendarReadAt = 0;
  private calendarReading = false;
  private occasionNotice: string | null = null;
  /** The backend refused the occasion arguments: picks go without them until the next run. */
  private occasionRefused = false;

  // Pace.
  private pedometerAvailable: boolean | null = null;
  private running = false;
  private sensorEpoch = 0;
  private pedometerSubscription: Removable | null = null;
  private locationSubscription: Removable | null = null;
  private pedometerActive = false;
  /** No pedometer, but a real device with GPS: cadence is estimated from speed. */
  private gpsPace = false;
  private awaitingStepBaseline = false;
  private sampleTimer: ReturnType<typeof setInterval> | null = null;
  private speeds: SpeedSample[] = [];
  private cadenceSpm = 0;
  private speedMps: number | null = null;
  private readonly steps = new CadenceWindow({
    windowMs: TUNING.sensing.cadenceWindowMs,
    graceMs: CONFIG.sensing.cadenceGraceMs,
    minSpanMs: CONFIG.sensing.cadenceMinSpanMs,
    maxSpm: CONFIG.sensing.maxCadenceSpm,
  });

  // Known places.
  private places: readonly SavedPlace[] = [];
  private savingPlace = false;
  private placeNotice: string | null = null;

  constructor(private readonly deps: SensingDeps) {
    // Anything that is not a real phone is a demo environment, and shows the default scenario.
    if (isWeb() || !Device.isDevice) this.chosenScenario = SCENARIOS[0];
    this.scenarioSince = Date.now();
    this.store = new Store(this.buildSnapshot(null));
  }

  // ---------------------------------------------------------------- public

  readonly getSnapshot = (): SensingSnapshot => this.store.get();

  /** True once the signals have been gathered for this run (by the setup sequence or `prepare`). */
  get isActive(): boolean {
    return this.active;
  }

  /**
   * Chooses a demo scenario outright, or with null goes back to sensing. A
   * chosen scenario's place, pace, event and pinned weather and hour override
   * the device.
   */
  readonly chooseScenario = (id: string | null): void => {
    const scenario = scenarioById(id);
    if (id !== null && !scenario) return;
    this.chosenScenario = scenario;
    this.scenarioChosenByUser = true;
    this.pinnedIsNewer = false;
    this.scenarioSince = Date.now();
    this.publish();
    this.maybeFetchWeather();
  };

  /**
   * Finds where the device is (asking for location access if needed), names the
   * spot through the backend and makes it the location. In a browser this must
   * be called from a tap. Outcome: `locationStatus`.
   */
  readonly locateDevice = (): void => {
    this.findDevice().catch((error: unknown) => reportError('locate', error));
  };

  /** Places matching what the user typed. Never rejects: an empty list on any failure. */
  readonly searchPlaces = async (query: string): Promise<PlaceResult[]> => {
    const backend = this.deps.getBackend();
    const wanted = typeof query === 'string' ? query.trim() : '';
    if (!backend || !wanted) return [];
    try {
      const found = await this.timers.withTimeout(
        backend.searchPlaces({ query: wanted }),
        CONFIG.sensing.placeLookupTimeoutMs,
      );
      return Array.isArray(found) ? found.filter((place) => toLocation(place, 'chosen') !== null) : [];
    } catch {
      return [];
    }
  };

  /** Makes a place from a search the location, over whatever the device says, and remembers it. */
  readonly chooseLocation = (place: PlaceResult): void => {
    const location = toLocation(place, 'chosen');
    if (!location) return;
    this.locationEpoch += 1;
    this.locationStatus = 'idle';
    this.pinned = location;
    this.pinnedIsNewer = true;
    void storeChosenLocation(location);
    this.publish();
    this.maybeFetchWeather();
  };

  /** Forgets the chosen place and the device's; the next run finds the place afresh. */
  readonly clearLocation = (): void => {
    this.locationEpoch += 1;
    this.locationStatus = 'idle';
    this.pinned = null;
    this.pinnedIsNewer = false;
    this.deviceLocation = null;
    this.lastLookup = null;
    void storeChosenLocation(null);
    this.publish();
    this.maybeFetchWeather();
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

  /** Tests and tooling: fixes the signals (see `SignalOverride`), or with null releases them. */
  setOverride(values: SignalOverride | null): void {
    if (values === null) {
      this.override = null;
    } else {
      const previous = this.override;
      const next = {
        cadenceSpm: previous?.cadenceSpm ?? 100,
        weather: previous?.weather ?? ('clear' as Weather),
        localHour: previous?.localHour ?? localHourOf(new Date(Date.now())),
        setting: previous?.setting ?? ('city' as Setting),
        occasion: previous?.occasion ?? null,
        minutesUntil: previous?.minutesUntil ?? 45,
      };
      if (typeof values.cadenceSpm === 'number' && Number.isFinite(values.cadenceSpm)) {
        next.cadenceSpm = clamp(Math.round(values.cadenceSpm), 0, CONFIG.sensing.maxCadenceSpm);
      }
      if (typeof values.localHour === 'number' && Number.isFinite(values.localHour)) {
        next.localHour = clamp(values.localHour, 0, 24);
      }
      if (values.weather !== undefined && WEATHERS.includes(values.weather)) next.weather = values.weather;
      if (values.setting !== undefined && SETTINGS.includes(values.setting)) next.setting = values.setting;
      if (values.occasion === null || isOccasion(values.occasion)) next.occasion = values.occasion;
      if (typeof values.minutesUntil === 'number' && Number.isFinite(values.minutesUntil)) {
        next.minutesUntil = clamp(Math.round(values.minutesUntil), 0, TUNING.occasion.leadMinutes);
      }
      this.override = next;
    }
    this.publish();
  }

  /** The backend would not take an occasion: picks go without one, and the user is told. */
  noteOccasionRefused(): void {
    this.occasionRefused = true;
    this.occasionNotice = MESSAGES.occasionUnsupported;
    this.publish();
  }

  /** A new run tries the occasion again. */
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

  /** Called when the provider mounts. Reads what was saved; shows no prompt. */
  mount(): void {
    if (this.mounted) return;
    this.mounted = true;
    this.clockTimer = setInterval(this.onClock, CONFIG.sensing.clockMs);
    this.publish();
    void this.restore();
  }

  unmount(): void {
    if (!this.mounted) return;
    this.mounted = false;
    this.restoreEpoch += 1;
    this.stop();
    this.timers.clear();
    if (this.clockTimer !== null) clearInterval(this.clockTimer);
    this.clockTimer = null;
  }

  /** The app went to the background: sensors off until it returns. */
  suspend(): void {
    this.appActive = false;
    this.stopSensors();
  }

  /** The app is in the foreground again. */
  resume(): void {
    this.appActive = true;
    this.maybeReadCalendar(true);
    this.maybeFetchWeather();
    if (this.active) this.startSensors().catch((error: unknown) => reportError('sensors', error));
    this.publish();
  }

  // ---------------------------------------------------------------- a run

  /**
   * Starts a fresh run: forgets which signals fell back to the demo last time,
   * so each is tried on the device again. Returns the run's id for `sense`.
   */
  beginRun(): number {
    this.stop();
    return this.runEpoch;
  }

  /**
   * Gathers one signal, on the device if possible and from the demo scenario
   * otherwise, and says what it found. May show a permission prompt. Takes at
   * most about `budgetMs` (a system permission dialog is waited for; a browser's
   * is not, and a late answer still switches the signal to the device). Never
   * rejects; resolves null when the run was stopped or replaced meanwhile.
   */
  async sense(signal: SignalId, budgetMs: number, run = this.runEpoch): Promise<SignalFinding | null> {
    try {
      let finding: SignalFinding;
      if (this.override) finding = this.overrideFinding(signal);
      else if (signal === 'place') finding = await this.sensePlace(budgetMs, run);
      else if (signal === 'weather') finding = await this.senseWeather(budgetMs, run);
      else if (signal === 'time') finding = this.senseTime();
      else if (signal === 'calendar') finding = await this.senseCalendar(budgetMs, run);
      else finding = await this.sensePace(run);
      if (run !== this.runEpoch) return null;
      this.publish();
      return finding;
    } catch (error) {
      reportError(`sense ${signal}`, error);
      return run === this.runEpoch ? { detail: '', source: 'demo' } : null;
    }
  }

  /** The run's signals are all gathered: keep them up to date from here on. */
  activate(run = this.runEpoch): void {
    if (run !== this.runEpoch || !this.mounted) return;
    this.active = true;
    if (this.sampleTimer === null) {
      this.sampleTimer = setInterval(this.sample, TUNING.sensing.sampleMs);
    }
    this.sample();
  }

  /**
   * A quick, silent setup: gathers every signal with the same sources as the
   * setup sequence, without its pacing. Resolves when sensing is active (or the
   * run was stopped). Never rejects.
   */
  async prepare(): Promise<void> {
    if (this.active) return;
    const run = this.beginRun();
    for (const signal of ['place', 'weather', 'time', 'calendar', 'pace'] as const) {
      if ((await this.sense(signal, CONFIG.sensing.quickBudgetMs, run)) === null) return;
    }
    this.activate(run);
  }

  /** Ends the run: sensors off, and the next run senses everything afresh. */
  stop(): void {
    this.runEpoch += 1;
    this.active = false;
    this.runScenario = null;
    this.gaps = { place: false, weather: false, calendar: false, pace: false };
    if (this.locationStatus === 'locating') this.locationStatus = 'idle';
    this.stopSensors();
  }

  // ---------------------------------------------------------------- the signals

  private overrideFinding(signal: SignalId): SignalFinding {
    const fixed = this.override!;
    const now = new Date(Date.now());
    if (signal === 'place') return { detail: placeForSetting(fixed.setting) ?? 'Somewhere', source: 'demo' };
    if (signal === 'weather') return { detail: describeWeather(fixed.weather, null), source: 'demo' };
    if (signal === 'time') return { detail: describeTime(now.getDay(), fixed.localHour), source: 'demo' };
    if (signal === 'calendar') return { detail: describeOccasion(this.activeOccasion(now.getTime())), source: 'demo' };
    return { detail: describePace(fixed.cadenceSpm), source: 'demo' };
  }

  /** The scenario filling this run's gaps, taken from the rotation on first need. */
  private fallbackScenario(): Scenario {
    if (this.chosenScenario) return this.chosenScenario;
    if (!this.runScenario) {
      this.runScenario = SCENARIOS[this.rotation % SCENARIOS.length];
      this.rotation += 1;
      this.scenarioSince = Date.now();
    }
    return this.runScenario;
  }

  /** The scenario whose place is in effect, or null when the place is a pinned or a device one. */
  private placeScenario(): Scenario | null {
    if (this.chosenScenario && !this.pinnedIsNewer) return this.chosenScenario;
    if (this.pinned || this.deviceLocation) return null;
    return this.gaps.place ? this.runScenario : null;
  }

  private async sensePlace(budgetMs: number, run: number): Promise<SignalFinding> {
    const demoPlace = (): SignalFinding => {
      const scenario = this.placeScenario() ?? this.fallbackScenario();
      return { detail: scenario.place ? scenario.place.label : 'At home', source: 'demo' };
    };
    if (this.chosenScenario && !this.pinnedIsNewer) return demoPlace();
    if (this.pinned) return { detail: this.pinned.label, source: 'demo' };

    const epoch = ++this.locationEpoch;
    this.locationStatus = 'locating';
    this.publish();
    const started = Date.now();
    // The fix goes on after the budget: a browser's permission prompt can be answered late.
    const fixing = this.fixOnce(budgetMs * 3);
    const fix = await Promise.race([fixing, this.timers.sleep(budgetMs).then(() => 'late' as const)]);
    if (run !== this.runEpoch) return demoPlace();

    if (typeof fix !== 'string') {
      const left = Math.max(1000, budgetMs - (Date.now() - started));
      const location = await this.nameFix(fix, left);
      if (run === this.runEpoch && epoch === this.locationEpoch) {
        this.deviceLocation = location;
        this.locationStatus = 'idle';
      }
      return { detail: location.label, source: 'device' };
    }

    this.gaps.place = true;
    if (fix === 'late') {
      void fixing.then((late) => {
        if (run !== this.runEpoch || epoch !== this.locationEpoch || !this.mounted) return;
        if (typeof late === 'string') {
          this.locationStatus = late;
          this.publish();
          return;
        }
        void this.nameFix(late, CONFIG.sensing.placeLookupTimeoutMs).then((location) => {
          if (run !== this.runEpoch || epoch !== this.locationEpoch || !this.mounted) return;
          this.deviceLocation = location;
          this.locationStatus = 'idle';
          this.gaps.place = false;
          this.publish();
          this.maybeFetchWeather();
        });
      });
    } else if (epoch === this.locationEpoch) {
      this.locationStatus = fix;
    }
    return demoPlace();
  }

  /** The place at a device position; a position the map has no name for is still a place. */
  private async nameFix(fix: Coordinates, budgetMs: number): Promise<ScoreLocation> {
    const unnamed = { label: CONFIG.sensing.unnamedLocationLabel };
    const backend = this.deps.getBackend();
    let place: Awaited<ReturnType<Backend['reversePlace']>> = null;
    if (backend) {
      try {
        place = await this.timers.withTimeout(backend.reversePlace(fix), budgetMs);
      } catch {
        place = null;
      }
    }
    this.lastLookup = { ...fix, at: Date.now(), named: place !== null };
    return (
      toLocation({ ...(place ?? unnamed), ...fix }, 'device') ??
      (toLocation({ ...unnamed, ...fix }, 'device') as ScoreLocation)
    );
  }

  private async senseWeather(budgetMs: number, run: number): Promise<SignalFinding> {
    const pin = this.chosenScenario?.pin;
    if (pin?.weather) return { detail: describeWeather(pin.weather, pin.temperatureC ?? null), source: 'demo' };

    const location = this.effectiveLocation();
    const backend = this.deps.getBackend();
    if (location && backend && !this.weatherAt(location)) {
      const at = { lat: location.lat, lon: location.lon };
      const token = ++this.weatherToken;
      this.weatherAttempt = { ...at, at: Date.now() };
      try {
        const report = await this.timers.withTimeout(backend.weather(at), budgetMs);
        if (token === this.weatherToken && report.weather !== 'any') {
          this.weather = { ...at, weather: report.weather, temperatureC: report.temperatureC, at: Date.now() };
        }
      } catch {
        // The demo weather below; the periodic refresh tries the real one again.
      }
    }
    if (run !== this.runEpoch) return { detail: '', source: 'demo' };
    const known = location ? this.weatherAt(location) : null;
    if (known) return { detail: describeWeather(known.weather, known.temperatureC), source: 'device' };
    this.gaps.weather = true;
    return { detail: describeWeather(this.fallbackScenario().fallbackWeather, null), source: 'demo' };
  }

  private senseTime(): SignalFinding {
    const now = new Date(Date.now());
    const pinned = this.chosenScenario?.pin?.hour;
    if (pinned !== undefined) return { detail: describeTime(now.getDay(), pinned), source: 'demo' };
    return { detail: describeTime(now.getDay(), localHourOf(now)), source: 'device' };
  }

  private async senseCalendar(budgetMs: number, run: number): Promise<SignalFinding> {
    const now = () => Date.now();
    if (!this.chosenScenario && !this.calendarDeclined) {
      const access = await calendarAccess(true);
      if (run !== this.runEpoch) return { detail: '', source: 'demo' };
      this.calendarAccess = access;
      if (access === 'granted') {
        if (!this.calendarEnabled) {
          this.calendarEnabled = true;
          void storeCalendarEnabled(true);
        }
        try {
          this.calendarEvents = await this.timers.withTimeout(readOccasionEvents(now()), budgetMs);
          this.calendarReadAt = now();
          if (this.occasionNotice === MESSAGES.calendarUnreadable) this.occasionNotice = null;
        } catch {
          this.calendarEvents = [];
        }
        return { detail: describeOccasion(this.calendarOccasion(now())), source: 'device' };
      }
    }
    if (!this.chosenScenario) {
      this.gaps.calendar = true;
      this.fallbackScenario();
    }
    return { detail: describeOccasion(this.demoOccasion(now())), source: 'demo' };
  }

  private async sensePace(run: number): Promise<SignalFinding> {
    if (!this.chosenScenario) {
      if (await this.checkPedometer()) {
        try {
          const response = await Pedometer.requestPermissionsAsync();
          this.setPermissions({ motion: response.granted ? 'granted' : 'denied' });
        } catch {
          // Stays as it was; the pace falls back to GPS speed or the demo.
        }
      }
      if (run !== this.runEpoch) return { detail: '', source: 'demo' };
      await this.startSensors();
      if (run !== this.runEpoch) return { detail: '', source: 'demo' };
      if (this.pedometerActive || this.gpsPace) {
        return { detail: describePace(this.cadenceSpm), source: 'device' };
      }
      this.gaps.pace = true;
    }
    const cadence = demoCadence(this.fallbackScenario().pace, Date.now());
    return { detail: describePace(cadence), source: 'demo' };
  }

  // ---------------------------------------------------------------- snapshot

  /**
   * The place in effect: a chosen scenario's or a place the user picked
   * (whichever was set last), else the device's, else the run scenario's.
   */
  private effectiveLocation(): ScoreLocation | null {
    const scenario = this.placeScenario();
    if (scenario) return scenarioLocation(scenario);
    return this.pinned ?? this.deviceLocation;
  }

  /** The fetched weather, when it is for this location. */
  private weatherAt(location: Coordinates) {
    const known = this.weather;
    return known && distanceMeters(known, location) <= CONFIG.sensing.sameSpotM ? known : null;
  }

  /** The demo scenario's event, counting down from when the scenario was adopted. */
  private demoOccasion(now: number): ScoreOccasion | null {
    const scenario = this.chosenScenario ?? (this.gaps.calendar ? this.runScenario : null);
    if (!scenario?.event) return null;
    const { occasion, minutesUntil, title } = scenario.event;
    const elapsed = Math.floor((now - this.scenarioSince) / 60000);
    const active: ScoreOccasion = { id: occasion, minutesUntil: Math.max(0, minutesUntil - elapsed) };
    if (title) active.title = title;
    return active;
  }

  /** The calendar's next recognised event, with its own title beside it for display. */
  private calendarOccasion(now: number): ScoreOccasion | null {
    const next = nextOccasion(this.calendarEvents, now);
    if (!next) return null;
    // The same choice `nextOccasion` made, found again to recover the title it does not carry.
    const event = this.calendarEvents.find(
      (candidate) =>
        candidate.id === next.id &&
        candidate.endMs > now &&
        Math.ceil((candidate.startMs - now) / 60000) === next.minutesUntil,
    );
    return event?.title ? { ...next, title: event.title } : next;
  }

  private activeOccasion(now: number): ScoreOccasion | null {
    if (this.occasionRefused) return null;
    if (this.override) {
      const { occasion, minutesUntil } = this.override;
      return occasion ? { id: occasion, minutesUntil } : null;
    }
    if (this.chosenScenario || this.gaps.calendar) return this.demoOccasion(now);
    if (!this.calendarEnabled || this.calendarAccess !== 'granted') return null;
    return this.calendarOccasion(now);
  }

  private buildSnapshot(previous: SensingSnapshot | null): SensingSnapshot {
    const now = Date.now();
    const nowDate = new Date(now);
    let occasion = this.activeOccasion(now);
    const location = this.override ? null : this.effectiveLocation();
    const placeScenario = this.override ? null : this.placeScenario();
    const chosen = this.override ? null : this.chosenScenario;

    // Where each signal comes from right now; null while it has not been sensed.
    const sources: Record<SignalId, SignalSource | null> = {
      place: null,
      weather: null,
      time: chosen?.pin?.hour !== undefined ? 'demo' : 'device',
      calendar: null,
      pace: null,
    };
    let live: LiveReadings;
    let context: PlayContext;
    let herePlace: SavedPlace | null = null;

    if (this.override) {
      const fixed = this.override;
      sources.place = sources.weather = sources.calendar = sources.pace = 'demo';
      sources.time = 'demo';
      const placeName = placeForSetting(fixed.setting);
      live = {
        cadenceSpm: fixed.cadenceSpm,
        speedMps: null,
        weather: fixed.weather,
        temperatureC: null,
        placeName,
        localHour: fixed.localHour,
      };
      context = {
        cadenceSpm: fixed.cadenceSpm,
        weather: fixed.weather,
        localHour: fixed.localHour,
        setting: fixed.setting,
        simulated: true,
      };
      if (placeName) context.placeName = placeName;
    } else {
      // Place.
      const fromDevice = location !== null && location.source === 'device';
      if (location) sources.place = fromDevice ? 'device' : 'demo';
      else if (placeScenario) sources.place = 'demo';
      const at: Coordinates | null = fromDevice && this.coordinates ? this.coordinates : location;
      const located =
        fromDevice && (this.running || now - this.coordinatesAt <= CONFIG.sensing.location.lastKnownMaxAgeMs);
      herePlace = located ? placeAt(this.places, this.coordinates) : null;
      let setting: Setting = 'any';
      if (herePlace) setting = PLACE_SETTING[herePlace.kind];
      else if (placeScenario) setting = placeScenario.setting;
      else if (location) setting = location.setting;
      const placeName = location
        ? placeNameOf(location)
        : placeScenario
          ? placeForSetting(placeScenario.setting)
          : null;

      // Weather.
      let weather: Weather = 'any';
      let temperatureC: number | null = null;
      const known = location ? this.weatherAt(location) : null;
      if (chosen?.pin?.weather) {
        weather = chosen.pin.weather;
        temperatureC = chosen.pin.temperatureC ?? null;
        sources.weather = 'demo';
      } else if (known) {
        weather = known.weather;
        temperatureC = known.temperatureC;
        sources.weather = 'device';
      } else if (this.gaps.weather && (chosen ?? this.runScenario)) {
        weather = (chosen ?? this.runScenario)!.fallbackWeather;
        sources.weather = 'demo';
      }

      // Time.
      const localHour = chosen?.pin?.hour ?? localHourOf(nowDate);

      // Calendar.
      if (chosen || this.gaps.calendar) sources.calendar = 'demo';
      else if (this.calendarEnabled && this.calendarAccess === 'granted') sources.calendar = 'device';

      // Pace.
      let cadenceSpm = 0;
      let speedMps: number | null = null;
      const paceScenario = chosen ?? (this.gaps.pace ? this.runScenario : null);
      if (paceScenario) {
        cadenceSpm = demoCadence(paceScenario.pace, now);
        sources.pace = 'demo';
      } else if (this.pedometerActive || this.gpsPace) {
        cadenceSpm = this.cadenceSpm;
        speedMps = this.speedMps;
        sources.pace = 'device';
      }

      live = { cadenceSpm, speedMps, weather, temperatureC, placeName, localHour };
      context = {
        cadenceSpm,
        weather,
        localHour,
        setting,
        simulated: sources.place === 'demo' || sources.pace === 'demo',
      };
      if (speedMps !== null) context.speedMps = speedMps;
      if (temperatureC !== null) context.temperatureC = temperatureC;
      if (placeName) context.placeName = placeName;
      if (at) {
        context.lat = at.lat;
        context.lon = at.lon;
      }
    }
    if (occasion) context.occasion = occasion.id;

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
    let demo: SensingSnapshot['demo'] = {
      scenarios: DEMO_LIST,
      activeId: chosen ? chosen.id : null,
      choose: this.chooseScenario,
    };
    if (previous) {
      context = reuseIfEqual(previous.context, context);
      scene = reuseIfEqual(previous.scene, scene);
      live = reuseIfEqual(previous.live, live);
      demo = reuseIfEqual(previous.demo, demo);
      if (occasion && previous.occasion) occasion = reuseIfEqual(previous.occasion, occasion);
    }
    const location2 = previous?.location && location ? reuseIfEqual(previous.location, location) : location;
    return {
      permissions: this.permissions,
      sources: previous ? reuseIfEqual(previous.sources, sources) : sources,
      live,
      context,
      scene,
      location: location2,
      locationStatus: this.locationStatus,
      demo,
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

  private publish(): void {
    this.store.set(this.buildSnapshot(this.store.get()));
  }

  private setPermissions(patch: Partial<SensingSnapshot['permissions']>): void {
    this.permissions = reuseIfEqual(this.permissions, { ...this.permissions, ...patch });
  }

  /** Once a minute: the clock moved, the weather may be stale, the calendar may have changed. */
  private readonly onClock = (): void => {
    try {
      this.maybeReadCalendar();
      this.maybeFetchWeather();
      this.publish();
    } catch (error) {
      reportError('clock', error);
    }
  };

  /** Reads what the user saved on this device: known places and the chosen location. Shows no prompt. */
  private async restore(): Promise<void> {
    const epoch = this.restoreEpoch;
    const [places, chosen] = await Promise.all([loadPlaces(), loadChosenLocation()]);
    if (!this.mounted || epoch !== this.restoreEpoch) return;
    // Anything the user did while storage was being read is newer than what is in it.
    if (this.places.length === 0) this.places = places;
    if (chosen && this.pinned === null && this.locationEpoch === 0) {
      this.pinned = chosen;
      // A place the user picked earlier outranks the default scenario, not one they chose since.
      this.pinnedIsNewer = !this.scenarioChosenByUser;
    }
    this.publish();
    this.maybeFetchWeather();
  }

  // ---------------------------------------------------------------- place

  private async findDevice(): Promise<void> {
    const epoch = ++this.locationEpoch;
    const superseded = () => epoch !== this.locationEpoch || !this.mounted;
    this.locationStatus = 'locating';
    this.publish();

    const fix = await this.fixOnce(CONFIG.sensing.placeFixTimeoutMs);
    if (superseded()) return;
    if (typeof fix === 'string') {
      this.locationStatus = fix;
      this.publish();
      return;
    }
    const backend = this.deps.getBackend();
    let place: Awaited<ReturnType<Backend['reversePlace']>> = null;
    let failed = !backend;
    if (backend) {
      try {
        place = await this.timers.withTimeout(backend.reversePlace(fix), CONFIG.sensing.placeLookupTimeoutMs);
      } catch {
        failed = true;
      }
    }
    if (superseded()) return;
    const named = place ?? { label: CONFIG.sensing.unnamedLocationLabel };
    const location = failed ? null : toLocation({ ...named, ...fix }, 'device');
    if (!location) {
      this.locationStatus = 'error';
      this.publish();
      return;
    }
    // The user asked for the device's own position: it replaces a place they picked.
    this.locationStatus = 'idle';
    this.deviceLocation = location;
    this.pinned = null;
    this.pinnedIsNewer = false;
    this.gaps.place = false;
    void storeChosenLocation(null);
    this.publish();
    this.maybeFetchWeather();
  }

  /** One position from the device, or why there is none. Never rejects. */
  private async fixOnce(timeoutMs: number): Promise<Coordinates | 'denied' | 'unavailable'> {
    if (this.running && this.locationSubscription && this.coordinates) return this.coordinates;
    // A browser shows its prompt when a position is asked for; asking it for the
    // permission first would only ask twice.
    if (!isWeb()) {
      try {
        let permission = await Location.getForegroundPermissionsAsync();
        if (!permission.granted) permission = await Location.requestForegroundPermissionsAsync();
        this.setPermissions({ location: permission.granted ? 'granted' : 'denied' });
        if (!permission.granted) return 'denied';
      } catch {
        return 'unavailable';
      }
    }
    try {
      const fix = await this.timers.withTimeout(
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        timeoutMs,
      );
      const { latitude, longitude } = fix.coords;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return 'unavailable';
      this.setPermissions({ location: 'granted' });
      this.coordinates = { lat: latitude, lon: longitude };
      this.coordinatesAt = Date.now();
      return this.coordinates;
    } catch (error) {
      // The browser's own error: code 1 is "permission denied".
      if ((error as { code?: unknown } | null)?.code === 1) {
        this.setPermissions({ location: 'denied' });
        return 'denied';
      }
      return 'unavailable';
    }
  }

  /** While moving: names the device's position again after ~150 m, at most once a minute. */
  private maybeLookUpPlace(now: number): void {
    const at = this.coordinates;
    const backend = this.deps.getBackend();
    if (!at || !backend || this.placeLookupInFlight) return;
    const last = this.lastLookup;
    if (last) {
      if (now - last.at < CONFIG.sensing.geocodeMinIntervalMs) return;
      const moved = distanceMeters(last, at) >= CONFIG.sensing.geocodeMinDistanceM;
      if (last.named && !moved) return;
    }
    const attempt = { ...at, at: now, named: false };
    this.lastLookup = attempt;
    const epoch = this.locationEpoch;
    this.placeLookupInFlight = true;
    this.timers
      .withTimeout(backend.reversePlace(at), CONFIG.sensing.placeLookupTimeoutMs)
      .then((place) => {
        if (epoch !== this.locationEpoch || !this.mounted || !place) return;
        const location = toLocation({ ...place, ...at }, 'device');
        if (!location) return;
        attempt.named = true;
        this.deviceLocation = location;
        this.gaps.place = false;
        this.publish();
        this.maybeFetchWeather();
      })
      .catch(() => {
        // Tried again after the minimum interval.
      })
      .finally(() => {
        this.placeLookupInFlight = false;
      });
  }

  // ---------------------------------------------------------------- weather

  /**
   * Fetches the real weather at the place in effect: when the place is new, and
   * again when the weather is older than the backend's cache. A result for a
   * place that is no longer the one in effect is dropped.
   */
  private maybeFetchWeather(): void {
    if (!this.mounted || this.override) return;
    // A pinned weather is shown whatever the sky does: there is nothing to fetch.
    if (this.chosenScenario?.pin?.weather) return;
    const location = this.effectiveLocation();
    const backend = this.deps.getBackend();
    if (!location || !backend) return;
    const now = Date.now();
    const known = this.weatherAt(location);
    if (known && now - known.at < TUNING.weatherCacheMs) return;
    const tried = this.weatherAttempt;
    const triedHere = tried !== null && distanceMeters(tried, location) <= CONFIG.sensing.sameSpotM;
    if (triedHere && now - tried.at < CONFIG.sensing.weatherRetryMs) return;

    const at = { lat: location.lat, lon: location.lon };
    const token = ++this.weatherToken;
    this.weatherAttempt = { ...at, at: now };
    this.timers
      .withTimeout(backend.weather(at), CONFIG.sensing.weatherTimeoutMs)
      .then((report) => {
        // `any` means the backend could not tell: what we have stays.
        if (token !== this.weatherToken || !this.mounted || report.weather === 'any') return;
        const current = this.effectiveLocation();
        if (!current || distanceMeters(current, at) > CONFIG.sensing.sameSpotM) return;
        this.weather = { ...at, weather: report.weather, temperatureC: report.temperatureC, at: Date.now() };
        this.publish();
      })
      .catch(() => {
        // Tried again after the retry interval.
      });
  }

  // ---------------------------------------------------------------- calendar

  private async switchCalendar(enabled: boolean): Promise<void> {
    this.forgetOccasionRefusal();
    this.calendarDeclined = !enabled;
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
    if (access === 'granted') {
      this.occasionNotice = null;
      this.gaps.calendar = false;
    } else {
      this.occasionNotice = access === 'unavailable' ? MESSAGES.calendarUnavailable : MESSAGES.calendarDenied;
    }
    void storeCalendarEnabled(this.calendarEnabled);
    this.publish();
    this.maybeReadCalendar(true);
  }

  /** Reads the calendar again while it is in use, at most once per `calendarRefreshMs` unless forced. */
  private maybeReadCalendar(force = false): void {
    if (!this.mounted || !this.appActive || !this.active || this.calendarReading) return;
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
    const at = await this.fixOnce(CONFIG.sensing.placeFixTimeoutMs);
    this.savingPlace = false;
    if (typeof at !== 'string') {
      this.places = withPlace(this.places, kind, at, Date.now());
      void storePlaces(this.places);
    } else {
      this.placeNotice = MESSAGES.placeNoFix;
    }
    this.publish();
  }

  // ---------------------------------------------------------------- pace sensors

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

  /** Subscribes to the pedometer and to position updates, as far as they are allowed. */
  private async startSensors(): Promise<void> {
    if (!this.appActive || !this.mounted || this.running || this.override) return;
    this.running = true;
    const epoch = ++this.sensorEpoch;
    const now = Date.now();

    this.steps.reset();
    this.speeds = [];
    this.pedometerActive = false;
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
    // Position updates follow the user for place and weather; on a real phone
    // without a pedometer they also give the pace.
    if (this.permissions.location !== 'granted') return;
    this.gpsPace = !this.pedometerActive && !isWeb() && Device.isDevice;
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
      this.gpsPace = false;
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
    if (!this.active && this.sampleTimer !== null) {
      clearInterval(this.sampleTimer);
      this.sampleTimer = null;
    }
    this.pedometerActive = false;
    this.gpsPace = false;
    this.awaitingStepBaseline = false;
    this.steps.reset();
    this.speeds = [];
    this.cadenceSpm = 0;
    this.speedMps = null;
    if (this.mounted) this.publish();
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
      this.maybeLookUpPlace(now);
    } catch (error) {
      reportError('location', error);
    }
    this.sample();
  };

  /** Recomputes cadence and speed and publishes; also what moves the demo pace and the clock. Never throws. */
  private readonly sample = (): void => {
    try {
      if (this.running) {
        const now = Date.now();
        const windowMs = TUNING.sensing.cadenceWindowMs;
        this.speeds = this.speeds.filter((entry) => entry.t > now - windowMs);
        const speed = smoothedSpeed(this.speeds, now, { windowMs, graceMs: CONFIG.sensing.cadenceGraceMs });
        const cadence = this.pedometerActive
          ? this.steps.cadenceAt(now)
          : speed === null
            ? 0
            : cadenceFromSpeed(speed, CONFIG.sensing.speedToCadence, CONFIG.sensing.maxOnFootMps);
        this.cadenceSpm = Math.round(cadence);
        this.speedMps = speed === null ? null : Math.round(speed * 10) / 10;
      }
      if (this.mounted) this.publish();
    } catch (error) {
      reportError('sample', error);
    }
  };
}
