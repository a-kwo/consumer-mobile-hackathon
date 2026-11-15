/**
 * The globe's projection: an orthographic view of a unit sphere. Pure maths,
 * no imports, so it runs anywhere: in a worklet on the UI thread, on the JS
 * thread, and in Node (see scripts/check-globe.mjs).
 *
 * A place is a unit vector in the Earth's own frame: x towards 0°N 0°E,
 * y towards 0°N 90°E, z towards the north pole. The camera looks straight at
 * the place (`cameraLat`, `cameraLon`). A projected point has x to the right,
 * y up and z towards the viewer, all from -1 to 1: z above 0 is the near
 * side of the globe, z below 0 the far side.
 */

const RADIANS = Math.PI / 180;

export type Vector3 = { x: number; y: number; z: number };

/** The unit vector of a latitude and longitude, in degrees. */
export function toVector(lat: number, lon: number): Vector3 {
  'worklet';
  const phi = lat * RADIANS;
  const lambda = lon * RADIANS;
  return {
    x: Math.cos(phi) * Math.cos(lambda),
    y: Math.cos(phi) * Math.sin(lambda),
    z: Math.sin(phi),
  };
}

/** Where a unit vector appears to a camera looking at (`cameraLat`, `cameraLon`), in degrees. */
export function projectVector(
  vx: number,
  vy: number,
  vz: number,
  cameraLat: number,
  cameraLon: number
): Vector3 {
  'worklet';
  const phi = cameraLat * RADIANS;
  const lambda = cameraLon * RADIANS;
  const sinLon = Math.sin(lambda);
  const cosLon = Math.cos(lambda);
  const sinLat = Math.sin(phi);
  const cosLat = Math.cos(phi);
  // Turn the Earth so the camera's meridian faces the viewer, then tip it by the camera's latitude.
  const toward = vx * cosLon + vy * sinLon;
  return {
    x: vy * cosLon - vx * sinLon,
    y: vz * cosLat - toward * sinLat,
    z: vz * sinLat + toward * cosLat,
  };
}

/** A latitude and longitude seen by the camera. */
export function projectPlace(
  lat: number,
  lon: number,
  cameraLat: number,
  cameraLon: number
): Vector3 {
  'worklet';
  const v = toVector(lat, lon);
  return projectVector(v.x, v.y, v.z, cameraLat, cameraLon);
}

/** The signed shortest turn, in degrees, from longitude `from` to longitude `to`. */
export function shortestTurn(from: number, to: number): number {
  'worklet';
  return ((((to - from) % 360) + 540) % 360) - 180;
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

/**
 * Unpacks the land grid (see globe-dots.ts) into a flat list of unit vectors:
 * x, y, z, x, y, z and so on, one triple per land dot.
 */
export function unpackLand(grid: {
  stepDegrees: number;
  equatorCells: number;
  data: readonly string[];
}): number[] {
  const out: number[] = [];
  grid.data.forEach((ring, r) => {
    const lat = 90 - (r + 0.5) * grid.stepDegrees;
    const cells = Math.max(1, Math.round(grid.equatorCells * Math.cos(lat * RADIANS)));
    for (let digit = 0; digit < ring.length; digit += 1) {
      const bits = parseInt(ring[digit], 16);
      if (bits === 0) continue;
      for (let bit = 0; bit < 4; bit += 1) {
        const cell = digit * 4 + bit;
        if (cell >= cells || !(bits & (8 >> bit))) continue;
        const v = toVector(lat, -180 + ((cell + 0.5) / cells) * 360);
        out.push(v.x, v.y, v.z);
      }
    }
  });
  return out;
}

/**
 * Screen offsets that keep markers of nearby places from hiding each other.
 * Places are laid on a flat local plane (`pointsPerDegree` on screen), pushed
 * apart until they are `gapX` by `gapY` apart, and the push is returned in
 * points on screen. Far-apart places get no offset.
 */
export function spreadPlaces(
  places: readonly { lat: number; lon: number }[],
  pointsPerDegree: number,
  gapX: number,
  gapY: number
): { x: number; y: number }[] {
  const flat = places.map((place) => ({
    x: place.lon * Math.cos(place.lat * RADIANS) * pointsPerDegree,
    y: -place.lat * pointsPerDegree,
  }));
  const offsets = places.map(() => ({ x: 0, y: 0 }));
  for (let pass = 0; pass < 40; pass += 1) {
    let moved = false;
    for (let a = 0; a < flat.length; a += 1) {
      for (let b = a + 1; b < flat.length; b += 1) {
        const dx = flat[b].x + offsets[b].x - (flat[a].x + offsets[a].x);
        const dy = flat[b].y + offsets[b].y - (flat[a].y + offsets[a].y);
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
    if (!moved) break;
  }
  return offsets;
}
