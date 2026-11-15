/** Builds what the session sends to `next.pick` and `plays.log`. Pure. */
import type { ActiveOccasion } from '../../../convex/lib/occasion';
import type { Nudge, PlayContext, Scene } from '../../../convex/lib/validators';
import { CONFIG } from './config';
import type { PickArgs } from './types';

export type PickInput = {
  deviceId: string;
  context: PlayContext;
  /** What triggered the pick, when it was a tap. */
  nudge?: Nudge;
  /** The nudge being carried; zero when none. */
  energyBias: number;
  /** Songs the app already holds or could not play. */
  excludeDeezerIds: readonly number[];
  /** The occasion steering this pick, when there is one. */
  occasion?: ActiveOccasion | null;
};

/**
 * In simulated mode the simulator's weather and setting are sent and no
 * coordinates; in live mode the setting is `any` and coordinates are sent, so
 * the server looks the weather up itself. Optional fields are left out rather
 * than sent as undefined. Of an occasion only the id and the minutes until it
 * starts are sent.
 */
export function buildPickArgs(input: PickInput): PickArgs {
  const { context } = input;
  const args: PickArgs = {
    deviceId: input.deviceId,
    cadenceSpm: context.cadenceSpm,
    localHour: context.localHour,
    setting: context.setting,
  };
  if (context.simulated) {
    args.weatherOverride = context.weather;
  } else {
    if (context.speedMps !== undefined) args.speedMps = context.speedMps;
    if (context.lat !== undefined && context.lon !== undefined) {
      args.lat = context.lat;
      args.lon = context.lon;
    }
  }
  if (input.occasion) {
    args.occasion = input.occasion.id;
    args.minutesUntil = input.occasion.minutesUntil;
  }
  if (input.nudge) args.nudge = input.nudge;
  if (input.energyBias !== 0) args.energyBias = input.energyBias;
  if (input.excludeDeezerIds.length > 0) args.excludeDeezerIds = Array.from(input.excludeDeezerIds);
  return args;
}

/**
 * The context to store with a play. In live mode the server may know the
 * weather before the phone does (it resolves it from the coordinates), so the
 * scene it returned fills in what the phone's context is missing.
 */
export function contextForPlay(context: PlayContext, scene: Scene): PlayContext {
  if (context.simulated) return context;
  const next: PlayContext = { ...context };
  if (next.weather === 'any' && scene.weather !== 'any') next.weather = scene.weather;
  if (next.temperatureC === undefined && scene.temperatureC !== null) {
    next.temperatureC = scene.temperatureC;
  }
  return next;
}

/** The context without its occasion, for a backend that does not know occasions yet. */
export function withoutOccasion(context: PlayContext): PlayContext {
  if (context.occasion === undefined) return context;
  const plain: PlayContext = { ...context };
  delete plain.occasion;
  return plain;
}

/** How long to wait before the next attempt after `failures` consecutive failures. */
export function retryDelayMs(failures: number): number {
  if (failures <= 0) return 0;
  const { retryBaseMs, retryMaxMs } = CONFIG.session;
  return Math.min(retryMaxMs, retryBaseMs * 2 ** (failures - 1));
}
