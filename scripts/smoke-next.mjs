// Smoke test for the Convex backend: next:pick, the play log and the soundtrack.
//
//   node scripts/smoke-next.mjs
//
// Talks to the deployment in EXPO_PUBLIC_CONVEX_URL (read from .env.local) as a
// throwaway `sim-smoke-…` device, which the feed ignores. Exits non-zero on the
// first failed check. It leaves one skipped play behind; remove test plays with
//   npx convex run plays:purgeTestDevices '{"prefix":"sim-smoke-"}'
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { ConvexHttpClient } from 'convex/browser';
import { anyApi } from 'convex/server';

const root = new URL('..', import.meta.url);
const read = (path) => readFileSync(fileURLToPath(new URL(path, root)), 'utf8');

function convexUrl() {
  if (process.env.EXPO_PUBLIC_CONVEX_URL) return process.env.EXPO_PUBLIC_CONVEX_URL;
  const line = read('.env.local')
    .split('\n')
    .find((entry) => entry.trim().startsWith('EXPO_PUBLIC_CONVEX_URL='));
  if (!line) throw new Error('EXPO_PUBLIC_CONVEX_URL is not set in .env.local');
  return line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '');
}

/** A number from convex/tuning.ts, so the checks follow the tuning instead of copying it. */
function tuning(name) {
  const match = read('convex/tuning.ts').match(new RegExp(`\\b${name}:\\s*([0-9.]+)`));
  if (!match) throw new Error(`${name} not found in convex/tuning.ts`);
  return Number(match[1]);
}

let failures = 0;
function check(condition, message) {
  if (condition) return console.log(`  ok    ${message}`);
  failures += 1;
  console.error(`  FAIL  ${message}`);
}

const client = new ConvexHttpClient(convexUrl());
const deviceId = `sim-smoke-${Date.now().toString(36)}`;
// A match within the widened window still counts: that is what a thin library falls back to.
const tolerance = tuning('bpmTolerance') * tuning('bpmWidenFactor');
const PICKS_PER_CADENCE = 3;
const moment = { localHour: 18.2, weatherOverride: 'rain', setting: 'city' };

const fitsStride = (bpm, cadence) =>
  [cadence, cadence / 2, cadence * 2].some((target) => Math.abs(bpm - target) <= target * tolerance);
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;

async function picksFor(cadenceSpm, expectedPace) {
  console.log(`\nnext:pick at ${cadenceSpm} steps per minute`);
  const tracks = [];
  const latencies = [];
  for (let i = 0; i < PICKS_PER_CADENCE; i++) {
    const started = performance.now();
    const result = await client.action(anyApi.next.pick, {
      deviceId,
      cadenceSpm,
      ...moment,
      // What the app does: never ask for a song it already holds.
      excludeDeezerIds: tracks.map((track) => track.deezerId),
    });
    const ms = Math.round(performance.now() - started);
    latencies.push(ms);
    const { scene, track, error } = result;
    if (!track) {
      check(false, `returned a track (error: ${error})`);
      continue;
    }
    console.log(`  ${ms} ms  "${track.title}" by ${track.artist}, ${Math.round(track.bpm)} BPM  (${track.reason})`);
    const targetBpm = expectedPace === 'still' ? null : cadenceSpm;
    check(error === null && scene.pace === expectedPace && scene.bpm === targetBpm, `scene is "${scene.label}"`);
    check(/^https?:\/\//.test(track.previewUrl), 'has a preview URL');
    check(Boolean(track.title && track.artist && track.coverUrl && track.reason), 'has title, artist, cover and reason');
    if (targetBpm !== null) {
      check(fitsStride(track.bpm, targetBpm), `${Math.round(track.bpm)} BPM fits a ${targetBpm} stride`);
    }
    check(!tracks.some((other) => other.deezerId === track.deezerId), 'is not a song the client already holds');
    tracks.push({ ...track, scene });
  }
  return { tracks, latencies };
}

const health = await client.query(anyApi.health.get, {});
check(health.ok === true, `health:get on ${convexUrl()}`);

const slow = await picksFor(60, 'stroll');
const fast = await picksFor(160, 'run');
// Standing still has no BPM target and takes the other path, through the vector search.
const still = await picksFor(0, 'still');

console.log('\nslow walk against run');
if (slow.tracks.length > 0 && fast.tracks.length > 0) {
  const slowIds = new Set(slow.tracks.map((track) => track.deezerId));
  check(!fast.tracks.some((track) => slowIds.has(track.deezerId)), 'the two cadences get different songs');
  const slowEnergy = mean(slow.tracks.map((track) => track.energy));
  const fastEnergy = mean(fast.tracks.map((track) => track.energy));
  check(fastEnergy > slowEnergy, `the run is higher energy (${fastEnergy.toFixed(2)} against ${slowEnergy.toFixed(2)})`);
  if (still.tracks.length > 0) {
    const stillEnergy = mean(still.tracks.map((track) => track.energy));
    check(stillEnergy < fastEnergy, `standing still is calmer than the run (${stillEnergy.toFixed(2)})`);
  }

  const sample = fast.tracks[0];
  const audio = await fetch(sample.previewUrl, { headers: { Range: 'bytes=0-2047' } });
  check(audio.ok && (audio.headers.get('content-type') ?? '').startsWith('audio/'), 'the preview URL serves audio');
  await audio.arrayBuffer();

  console.log('\nplay log and soundtrack');
  const startedAt = Date.now();
  const logged = {
    deviceId,
    startedAt,
    context: {
      cadenceSpm: 160,
      weather: moment.weatherOverride,
      localHour: moment.localHour,
      setting: moment.setting,
      simulated: true,
      placeName: 'Valencia Street',
    },
    sceneKey: sample.scene.key,
    sceneLabel: sample.scene.label,
    reason: sample.reason,
  };
  const playId = await client.mutation(anyApi.plays.log, { ...logged, deezerId: sample.deezerId });
  check(typeof playId === 'string', 'plays:log returns a play id');
  const again = await client.mutation(anyApi.plays.log, { ...logged, deezerId: sample.deezerId });
  check(again === playId, 'logging the same play twice does not duplicate it');
  const unknown = await client.mutation(anyApi.plays.log, { ...logged, deezerId: -1, startedAt: startedAt + 1 });
  check(unknown === null, 'plays:log returns null for an unknown song');

  const day = { deviceId, dayStart: startedAt - 3_600_000, dayEnd: startedAt + 3_600_000 };
  const ost = await client.query(anyApi.ost.get, day);
  const entry = ost.entries[0];
  check(ost.entries.length === 1 && entry?.playId === playId, 'ost:get returns the play');
  check(entry?.songTitle === sample.title && entry?.bpm === sample.bpm, 'the entry carries the song details');
  check(/, 6:12pm$/.test(entry?.title ?? ''), `the entry is titled "${entry?.title}"`);
  check(ost.topMoods.length <= 3 && (sample.moods.length === 0 || ost.summary.length > 0), `summary: "${ost.summary}"`);

  await client.mutation(anyApi.plays.markSkipped, { deviceId: `${deviceId}-someone-else`, playId });
  const untouched = await client.query(anyApi.ost.get, day);
  check(untouched.entries.length === 1, 'another device cannot skip the play');
  await client.mutation(anyApi.plays.markSkipped, { deviceId, playId });
  const skipped = await client.query(anyApi.ost.get, day);
  check(skipped.entries.length === 0 && skipped.summary === '', 'a skipped play leaves the soundtrack');

  const replay = await client.action(anyApi.tracks.preview, { deezerId: sample.deezerId });
  check(/^https?:\/\//.test(replay.previewUrl ?? ''), 'tracks:preview returns a fresh URL for replay');
}

const all = [...slow.latencies, ...fast.latencies, ...still.latencies].sort((a, b) => a - b);
console.log(
  `\nnext:pick latency from this machine, ms: walking ${slow.latencies.join(', ')} | ` +
    `running ${fast.latencies.join(', ')} | still ${still.latencies.join(', ')}`,
);
console.log(`median ${all[Math.floor(all.length / 2)]} ms, slowest ${all[all.length - 1]} ms`);
console.log(failures === 0 ? '\nPASS' : `\nFAIL: ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
