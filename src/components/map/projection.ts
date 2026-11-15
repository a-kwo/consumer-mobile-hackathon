import { LAND_GRID } from './land-dots';

/**
 * The map's projection: Web Mercator, cropped to the latitudes the land grid
 * covers. Everything is in "map points": the whole world is `width` points
 * wide and `width / MAP_ASPECT` tall, with the origin at the top left.
 */
const mercator = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));

const Y_TOP = mercator(LAND_GRID.latTop);
const Y_BOTTOM = mercator(LAND_GRID.latBottom);

/** Width over height of the whole map. */
export const MAP_ASPECT = LAND_GRID.cols / LAND_GRID.rows;

export type MapPoint = { x: number; y: number };

/** Where a coordinate falls on a map `width` points wide. Out-of-range input is clamped onto the map. */
export function project(lat: number, lon: number, width: number): MapPoint {
  const height = width / MAP_ASPECT;
  const clampedLat = Math.min(LAND_GRID.latTop, Math.max(LAND_GRID.latBottom, lat));
  const wrappedLon = ((((lon + 180) % 360) + 360) % 360) - 180;
  return {
    x: ((wrappedLon + 180) / 360) * width,
    y: ((Y_TOP - mercator(clampedLat)) / (Y_TOP - Y_BOTTOM)) * height,
  };
}

/** True for numbers that can be a latitude and longitude. */
export function isCoordinate(lat: unknown, lon: unknown): boolean {
  return (
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180
  );
}

const pathCache = new Map<number, string>();

/**
 * The land as one SVG path of zero-length strokes: drawn with a round line cap
 * each becomes a dot, so five thousand grains cost one element.
 */
export function landPath(width: number): string {
  const cached = pathCache.get(width);
  if (cached) return cached;

  const cell = width / LAND_GRID.cols;
  const parts: string[] = [];
  LAND_GRID.data.forEach((row, r) => {
    const y = ((r + 0.5) * cell).toFixed(2);
    for (let digit = 0; digit < row.length; digit += 1) {
      const bits = parseInt(row[digit], 16);
      if (bits === 0) continue;
      for (let bit = 0; bit < 4; bit += 1) {
        if (bits & (8 >> bit)) {
          parts.push(`M${((digit * 4 + bit + 0.5) * cell).toFixed(2)} ${y}h0.01`);
        }
      }
    }
  });
  const path = parts.join('');
  pathCache.set(width, path);
  return path;
}

/** Spacing of the land dots on a map `width` points wide. */
export function dotPitch(width: number): number {
  return width / LAND_GRID.cols;
}

/**
 * A day's stops laid out around their own centre, for the close-up drawn on
 * top of the map: the map's dots are far too coarse to tell two streets
 * apart, so the route gets its own scale. Returns one point per stop inside a
 * circle of `radius`, north up. Stops that share a spot are fanned out so
 * every number can be read.
 */
export function layoutRoute(
  stops: readonly { lat: number; lon: number }[],
  radius: number
): MapPoint[] {
  if (stops.length === 0) return [];
  const lat0 = stops.reduce((sum, stop) => sum + stop.lat, 0) / stops.length;
  const lon0 = stops.reduce((sum, stop) => sum + stop.lon, 0) / stops.length;
  const shrink = Math.cos((lat0 * Math.PI) / 180);
  const raw = stops.map((stop) => ({ x: (stop.lon - lon0) * shrink, y: -(stop.lat - lat0) }));
  const reach = Math.max(...raw.map((point) => Math.hypot(point.x, point.y)));

  // Everything in one place (or a single stop): a small ring, in order.
  if (reach < 1e-6) {
    if (stops.length === 1) return [{ x: 0, y: 0 }];
    return stops.map((_, index) => {
      const angle = (index / stops.length) * Math.PI * 2 - Math.PI / 2;
      return { x: Math.cos(angle) * radius * 0.6, y: Math.sin(angle) * radius * 0.6 };
    });
  }

  const points = raw.map((point) => ({
    x: (point.x / reach) * radius,
    y: (point.y / reach) * radius,
  }));
  // Nudge apart stops that landed on top of each other.
  const minGap = 15;
  for (let pass = 0; pass < 12; pass += 1) {
    for (let a = 0; a < points.length; a += 1) {
      for (let b = a + 1; b < points.length; b += 1) {
        const dx = points[b].x - points[a].x;
        const dy = points[b].y - points[a].y;
        const distance = Math.hypot(dx, dy);
        if (distance >= minGap) continue;
        const angle = distance < 0.01 ? (a * 2.4 + b) % (Math.PI * 2) : Math.atan2(dy, dx);
        const push = (minGap - distance) / 2;
        points[a].x -= Math.cos(angle) * push;
        points[a].y -= Math.sin(angle) * push;
        points[b].x += Math.cos(angle) * push;
        points[b].y += Math.sin(angle) * push;
      }
    }
  }
  // Keep the nudged points inside the circle.
  return points.map((point) => {
    const distance = Math.hypot(point.x, point.y);
    return distance <= radius
      ? point
      : { x: (point.x / distance) * radius, y: (point.y / distance) * radius };
  });
}

/**
 * Offsets that keep markers from hiding each other at world scale. Each
 * marker is pushed away from its neighbours until they are `gapX` by `gapY`
 * apart (an ellipse, since a marker with its name is taller than wide)
 * apart. `fixed` is a point that stays put and is kept clear (your own
 * marker). Offsets are in map points.
 */
export function spreadMarkers(
  points: readonly MapPoint[],
  gapX: number,
  gapY: number,
  bounds: { width: number; height: number },
  fixed: MapPoint | null = null
): MapPoint[] {
  const offsets = points.map(() => ({ x: 0, y: 0 }));
  for (let pass = 0; pass < 60; pass += 1) {
    let moved = false;
    for (let a = 0; a < points.length; a += 1) {
      for (let b = a + 1; b < points.length; b += 1) {
        const dx = points[b].x + offsets[b].x - (points[a].x + offsets[a].x);
        const dy = points[b].y + offsets[b].y - (points[a].y + offsets[a].y);
        // Distance in units of the allowed gap: under 1 means they overlap.
        const distance = Math.hypot(dx / gapX, dy / gapY);
        if (distance >= 1) continue;
        moved = true;
        const angle = distance < 0.01 ? a + b : Math.atan2(dy / gapY, dx / gapX);
        const push = (1 - distance) / 2 + 0.01;
        offsets[a].x -= Math.cos(angle) * push * gapX;
        offsets[a].y -= Math.sin(angle) * push * gapY;
        offsets[b].x += Math.cos(angle) * push * gapX;
        offsets[b].y += Math.sin(angle) * push * gapY;
      }
    }
    // The fixed point (your own marker) does not move; everyone else makes room for it.
    if (fixed) {
      for (let a = 0; a < points.length; a += 1) {
        const dx = points[a].x + offsets[a].x - fixed.x;
        const dy = points[a].y + offsets[a].y - fixed.y;
        const distance = Math.hypot(dx / (gapX * 0.8), dy / (gapY * 0.8));
        if (distance >= 1) continue;
        moved = true;
        const angle = distance < 0.01 ? a : Math.atan2(dy / gapY, dx / gapX);
        const push = 1 - distance + 0.01;
        offsets[a].x += Math.cos(angle) * push * gapX * 0.8;
        offsets[a].y += Math.sin(angle) * push * gapY * 0.8;
      }
    }
    if (!moved) break;
  }
  // Never push a marker off the map.
  return offsets.map((offset, index) => {
    const x = Math.min(bounds.width - gapX / 2, Math.max(gapX / 2, points[index].x + offset.x));
    const y = Math.min(bounds.height - gapY / 2, Math.max(gapY / 3, points[index].y + offset.y));
    return { x: x - points[index].x, y: y - points[index].y };
  });
}
