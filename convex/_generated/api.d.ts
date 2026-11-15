/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as crons from "../crons.js";
import type * as feed from "../feed.js";
import type * as health from "../health.js";
import type * as lib_bokeh from "../lib/bokeh.js";
import type * as lib_device from "../lib/device.js";
import type * as lib_hash from "../lib/hash.js";
import type * as lib_match from "../lib/match.js";
import type * as lib_names from "../lib/names.js";
import type * as lib_ost from "../lib/ost.js";
import type * as lib_preview from "../lib/preview.js";
import type * as lib_scene from "../lib/scene.js";
import type * as lib_titles from "../lib/titles.js";
import type * as lib_validators from "../lib/validators.js";
import type * as match from "../match.js";
import type * as next from "../next.js";
import type * as ost from "../ost.js";
import type * as photos from "../photos.js";
import type * as plays from "../plays.js";
import type * as profiles from "../profiles.js";
import type * as seed from "../seed.js";
import type * as tracks from "../tracks.js";
import type * as tuning from "../tuning.js";
import type * as weather from "../weather.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  crons: typeof crons;
  feed: typeof feed;
  health: typeof health;
  "lib/bokeh": typeof lib_bokeh;
  "lib/device": typeof lib_device;
  "lib/hash": typeof lib_hash;
  "lib/match": typeof lib_match;
  "lib/names": typeof lib_names;
  "lib/ost": typeof lib_ost;
  "lib/preview": typeof lib_preview;
  "lib/scene": typeof lib_scene;
  "lib/titles": typeof lib_titles;
  "lib/validators": typeof lib_validators;
  match: typeof match;
  next: typeof next;
  ost: typeof ost;
  photos: typeof photos;
  plays: typeof plays;
  profiles: typeof profiles;
  seed: typeof seed;
  tracks: typeof tracks;
  tuning: typeof tuning;
  weather: typeof weather;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
