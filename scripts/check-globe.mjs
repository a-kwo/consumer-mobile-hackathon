// Checks the globe's projection maths. Run: node scripts/check-globe.mjs
// (Node 22.18+ loads the TypeScript module directly; it has no imports.)
import assert from 'node:assert/strict';

import {
  projectPlace,
  shortestTurn,
  spreadPlaces,
  toVector,
  unpackLand,
} from '../src/components/map/globe-math.ts';

const near = (actual, expected, message) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: got ${actual}, expected ${expected}`);

// The place the camera looks at lands dead centre, facing the viewer.
let p = projectPlace(51.5, -0.13, 51.5, -0.13);
near(p.x, 0, 'centre x'); near(p.y, 0, 'centre y'); near(p.z, 1, 'centre z');

// From above the equator at 0°E: 90°E is on the right edge, the north pole on the top edge.
p = projectPlace(0, 90, 0, 0);
near(p.x, 1, 'east limb x'); near(p.y, 0, 'east limb y'); near(p.z, 0, 'east limb z');
p = projectPlace(90, 0, 0, 0);
near(p.x, 0, 'pole x'); near(p.y, 1, 'pole y'); near(p.z, 0, 'pole z');

// 30° north of the camera on the same meridian: straight up by sin 30°.
p = projectPlace(30, 10, 0, 10);
near(p.x, 0, 'north x'); near(p.y, 0.5, 'north y'); near(p.z, Math.cos(Math.PI / 6), 'north z');

// The far side is culled: the antipode, and Tokyo seen from New York, have z below 0.
assert.ok(projectPlace(-51.5, 179.87, 51.5, -0.13).z < -0.999, 'antipode is on the far side');
assert.ok(projectPlace(35.68, 139.65, 40.71, -74.0).z < 0, 'Tokyo is behind the globe from New York');
assert.ok(projectPlace(51.5, -0.13, 40.71, -74.0).z > 0, 'London is in front of the globe from New York');

// Projection keeps length: every projected point is on the unit sphere.
for (const [lat, lon] of [[12, 34], [-45, 170], [80, -120]]) {
  const q = projectPlace(lat, lon, 20, -60);
  near(q.x * q.x + q.y * q.y + q.z * q.z, 1, 'unit length');
}

// Turning takes the short way round, across the date line.
near(shortestTurn(170, -170), 20, 'turn across the date line');
near(shortestTurn(-170, 170), -20, 'turn back across the date line');
near(shortestTurn(370, 10), 0, 'unwrapped longitude');

// The land grid unpacks to unit vectors: a ring at 45°N of a 4-cell equator has 3 cells, the first centred on 120°W.
const land = unpackLand({ stepDegrees: 90, equatorCells: 4, data: ['8', '8'] });
assert.equal(land.length, 6, 'two dots, three numbers each');
const v = toVector(45, -120);
near(land[0], v.x, 'first dot x'); near(land[2], v.z, 'first dot z');

// Two markers in the same city are pushed apart; a distant one is left alone.
const offsets = spreadPlaces(
  [{ lat: 40.7, lon: -74 }, { lat: 40.7, lon: -74 }, { lat: 35.7, lon: 139.7 }],
  3.2, 46, 50,
);
assert.ok(Math.hypot(offsets[0].x - offsets[1].x, offsets[0].y - offsets[1].y) >= 40, 'neighbours spread');
near(offsets[2].x, 0, 'distant marker x'); near(offsets[2].y, 0, 'distant marker y');

console.log('globe maths: all checks passed');
