// Checks for the pure logic behind shared soundtracks: the day a phone may
// name, which cue a photo lands on, titles with places hidden, and the PNG
// encoder behind the seeded friends' lead images.
//
//   node scripts/check-share.mjs
//
// Needs no deployment. The TypeScript in convex/lib is bundled with esbuild,
// which the convex package already installs. Exits non-zero on the first
// failed check. Pass a path to also write the two generated images there:
//   node scripts/check-share.mjs .tmp
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

import { build } from 'esbuild';

const root = fileURLToPath(new URL('..', import.meta.url));
const bundled = await build({
  stdin: {
    contents: "export * from './convex/lib/ost'; export * from './convex/lib/bokeh'; export { TUNING } from './convex/tuning';",
    resolveDir: root,
    loader: 'ts',
  },
  bundle: true,
  format: 'esm',
  write: false,
  logLevel: 'silent',
});
const lib = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
const { TUNING } = lib;
const HOUR = 60 * 60 * 1000;

// ---- The day a phone may name ----
const pst = Date.parse('2026-11-15T08:00:00Z');
assert.ok(lib.isLocalDay({ date: '2026-11-15', dayStart: pst, dayEnd: pst + 24 * HOUR }), 'a Pacific day');
assert.ok(lib.isLocalDay({ date: '2026-11-01', dayStart: Date.parse('2026-11-01T07:00:00Z'), dayEnd: Date.parse('2026-11-02T08:00:00Z') }), 'a 25 hour daylight-saving day');
assert.ok(lib.isLocalDay({ date: '2026-11-15', dayStart: Date.parse('2026-11-14T10:00:00Z'), dayEnd: Date.parse('2026-11-15T10:00:00Z') }), 'UTC+14');
assert.ok(!lib.isLocalDay({ date: '2026-11-15', dayStart: pst, dayEnd: pst + 72 * HOUR }), 'three days is not a day');
assert.ok(!lib.isLocalDay({ date: '2026-11-15', dayStart: pst - 48 * HOUR, dayEnd: pst - 24 * HOUR }), 'midnights of another date');
assert.ok(!lib.isLocalDay({ date: '15/11/2026', dayStart: pst, dayEnd: pst + 24 * HOUR }), 'a date in another format');
assert.ok(!lib.isLocalDay({ date: '2026-11-15', dayStart: NaN, dayEnd: pst }), 'NaN');

// ---- Which cue a photo lands on ----
const plays = [{ startedAt: 1000 }, { startedAt: 5000 }, { startedAt: 9000 }];
assert.equal(lib.cueAt(plays, 6000)?.startedAt, 5000, 'the cue that was playing');
assert.equal(lib.cueAt(plays, 9000)?.startedAt, 9000, 'a photo at the very start of a cue');
assert.equal(lib.cueAt(plays, 999), null, 'before the first cue');
assert.equal(lib.cueAt(plays, 9000 + TUNING.share.photoCueWindowMs + 1), null, 'long after the last cue');
assert.equal(lib.cueAt([], 5000), null, 'no cues');

// ---- Titles ----
assert.equal(lib.cleanOstTitle('  The   long way home \n'), 'The long way home');
assert.equal(lib.cleanOstTitle('   '), null);
assert.equal(Array.from(lib.cleanOstTitle('x'.repeat(500))).length, TUNING.share.maxTitleChars);

const play = (placeName) => ({
  title: 'Rain on Valencia Street, 6:12pm',
  deezerId: 3135556,
  startedAt: 1_800_000_000_000,
  moods: ['reflective'],
  context: { cadenceSpm: 96, weather: 'rain', localHour: 18.2, setting: 'city', simulated: false, ...(placeName ? { placeName } : {}) },
});
for (const place of ['Valencia Street', 'the Mission', 'Golden Gate Park', 'Hayes Valley']) {
  const hidden = lib.publicTitle(play(place));
  assert.ok(!hidden.includes(place), `"${hidden}" still names ${place}`);
  assert.match(hidden, /, 6:12pm$/, 'the clock stays');
}
assert.equal(lib.publicTitle(play(undefined)), 'Rain on Valencia Street, 6:12pm', 'a play with no place keeps its stored title');

// ---- The generated lead images ----
const { width, height } = TUNING.share.seedPhoto;
const outDir = process.argv[2];
if (outDir) mkdirSync(outDir, { recursive: true });
for (const [name, palette] of Object.entries(lib.BOKEH_PALETTES)) {
  const png = lib.bokehPng(42, palette, width, height);
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'PNG signature');
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  assert.equal(view.getUint32(16), width);
  assert.equal(view.getUint32(20), height);
  // Walk the chunks, check each CRC, and inflate the image data back to the pixels.
  let at = 8;
  let idat = null;
  const types = [];
  while (at < png.length) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(...png.subarray(at + 4, at + 8));
    types.push(type);
    let crc = 0xffffffff;
    for (const byte of png.subarray(at + 4, at + 8 + length)) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    assert.equal((crc ^ 0xffffffff) >>> 0, view.getUint32(at + 8 + length), `${type} checksum`);
    if (type === 'IDAT') idat = png.subarray(at + 8, at + 8 + length);
    at += 12 + length;
  }
  assert.deepEqual(types, ['IHDR', 'IDAT', 'IEND']);
  const raw = inflateSync(idat);
  assert.equal(raw.length, (width * 3 + 1) * height, 'inflated size');
  const pixels = lib.bokehPixels(42, palette, width, height);
  assert.deepEqual([...raw.subarray(1, 1 + width * 3)], [...pixels.subarray(0, width * 3)], 'first row survives the round trip');
  assert.deepEqual(lib.bokehPng(42, palette, width, height), png, 'deterministic');
  assert.ok(png.length < 1024 * 1024, 'under a megabyte');
  if (outDir) writeFileSync(`${outDir}/bokeh-${name}.png`, png);
}

console.log('share checks passed');
