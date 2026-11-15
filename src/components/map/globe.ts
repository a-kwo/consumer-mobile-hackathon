import type { SharedValue } from 'react-native-reanimated';

import { GLOBE_GRID } from './globe-dots';
import { unpackLand } from './globe-math';

/** Every land dot as a unit vector: x, y, z, x, y, z… Built once. */
export const LAND_VECTORS: number[] = unpackLand(GLOBE_GRID);

/**
 * Where the globe is looking and how close. Shared values, so the renderer
 * and every pin follow a drag or a glide without React re-rendering.
 */
export type GlobeCamera = {
  /** Latitude at the centre of the view, in degrees. */
  lat: SharedValue<number>;
  /** Longitude at the centre of the view, in degrees. Not wrapped: it may run past 180. */
  lon: SharedValue<number>;
  /** 1 shows the whole globe. */
  zoom: SharedValue<number>;
  /** Moves the globe's centre down (positive) or up within its frame, in points. */
  shiftY: SharedValue<number>;
};

/** The frame the globe is drawn in, in points. */
export type GlobeFrame = {
  width: number;
  height: number;
  /** Radius of the globe at zoom 1. */
  radius: number;
};

/** The frame for a box: the globe fills the smaller side, with a margin. */
export function globeFrame(width: number, height: number, margin = 10): GlobeFrame {
  return { width, height, radius: Math.max(20, Math.min(width, height) / 2 - margin) };
}

/** Land dots are this many points across at zoom 1, on a globe of this radius. */
export function dotSize(radius: number, zoom: number): number {
  'worklet';
  return Math.max(1.2, radius * 0.0105 * Math.pow(zoom, 0.5));
}
