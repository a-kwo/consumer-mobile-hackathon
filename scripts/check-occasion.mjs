// Checks the pure logic behind calendar occasions: the title classifier, the
// ramp, the scene shift and the reason line. No network and no deployment.
//
//   node scripts/check-occasion.mjs
//
// Bundles the TypeScript in convex/lib with esbuild (already installed with
// convex) and runs it. Exits non-zero on the first failed check.
import { fileURLToPath } from 'node:url';

import { buildSync } from 'esbuild';

const root = fileURLToPath(new URL('..', import.meta.url));
const bundle = buildSync({
  stdin: {
    contents: [
      "export * from './convex/lib/occasion';",
      "export { buildScene } from './convex/lib/scene';",
      "export { reasonFor } from './convex/lib/match';",
      "export { OCCASIONS, PACES, SETTINGS, TIMES_OF_DAY, WEATHERS } from './convex/lib/validators';",
      "export { TUNING } from './convex/tuning';",
    ].join('\n'),
    resolveDir: root,
    loader: 'ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
});
const lib = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const { TUNING, OCCASIONS, PACES, SETTINGS, TIMES_OF_DAY, WEATHERS } = lib;

let failures = 0;
function check(condition, message) {
  if (condition) return console.log(`  ok    ${message}`);
  failures += 1;
  console.error(`  FAIL  ${message}`);
}

console.log('classifyTitle');
const titles = [
  ['Warriors game @ Chase Center', 'game'],
  ['Sunday league MATCH', 'game'],
  ['Morning run', 'workout'],
  ['Gym - leg day', 'workout'],
  ['Deep work: Q4 plan', 'focus'],
  ["Sam's birthday party", 'party'],
  ['Flight SFO → JFK', 'travel'],
  ['Wind down', 'wind_down'],
  ['Date night', 'date'],
  ['1:1 with Priya', null],
  ['Update roadmap', null],
  ['Gaming the system review', null],
  ['', null],
];
for (const [title, expected] of titles) {
  check(lib.classifyTitle(title) === expected, `"${title}" -> ${expected}`);
}

console.log('\nramp');
const { leadMinutes, peakMinutes, rampFloor } = TUNING.occasion;
check(lib.occasionStrength(leadMinutes + 1) === 0, 'nothing before the lead window');
check(Math.abs(lib.occasionStrength(leadMinutes) - rampFloor) < 1e-9, 'the floor at the edge of the window');
check(lib.occasionStrength(peakMinutes) === 1 && lib.occasionStrength(-20) === 1, 'full strength at the peak and while running');
check(lib.occasionStrength(45) < lib.occasionStrength(20), 'stronger as the event approaches');

console.log('\nscene');
const base = { cadenceSpm: 0, localHour: 15, weather: 'clear', setting: 'any' };
const plain = lib.buildScene(base);
check(!('occasion' in plain) && !('occasionLine' in plain), 'no occasion, no occasion fields');
check(
  JSON.stringify(lib.buildScene({ ...base, occasion: 'game', minutesUntil: leadMinutes + 30 })) === JSON.stringify(plain),
  'an occasion outside its window changes nothing',
);
const hourOut = lib.buildScene({ ...base, occasion: 'game', minutesUntil: 60 });
const tenOut = lib.buildScene({ ...base, occasion: 'game', minutesUntil: 10 });
check(plain.energy < hourOut.energy && hourOut.energy < tenOut.energy, 'a game builds: none < 60 min < 10 min');
check(hourOut.occasionLine === 'Game in 60 min · building up', `line at 60 min: ${hourOut.occasionLine}`);
check(tenOut.occasionLine === 'Game in 10 min · at the peak', `line at 10 min: ${tenOut.occasionLine}`);
check(lib.buildScene({ ...base, occasion: 'game', minutesUntil: -5 }).occasionLine === 'Game underway', 'line while running');
check(lib.buildScene({ ...base, occasion: 'workout', minutesUntil: 45 }).setting === 'any', 'a workout 45 min out implies no setting yet');
check(lib.buildScene({ ...base, occasion: 'workout', minutesUntil: 5 }).setting === 'gym', 'a workout at its peak implies the gym');
check(
  lib.buildScene({ ...base, setting: 'nature', occasion: 'workout', minutesUntil: 5 }).setting === 'nature',
  'an occasion never replaces a setting that was set',
);
check(lib.buildScene({ ...base, occasion: 'wind_down', minutesUntil: 0 }).energy < plain.energy, 'winding down lowers energy');

const keys = new Set();
for (const pace of PACES) for (const weather of WEATHERS) for (const time of TIMES_OF_DAY) for (const setting of SETTINGS) {
  keys.add(`${pace}|${weather}|${time}|${setting}`);
}
let offKey = 0;
let outOfRange = 0;
let longReason = 0;
const song = { deezerId: 1, title: 't', artist: 'a', coverUrl: '', bpm: 128, energy: 0.8, valence: 0.6, moods: ['euphoric', 'triumphant'], similarity: 0, score: 0 };
for (const occasion of OCCASIONS) for (const minutesUntil of [-30, 0, 5, 10, 11, 30, 59, 60]) for (const setting of SETTINGS) for (const cadenceSpm of [0, 100, 170]) for (const localHour of [3, 9, 15, 20]) {
  const scene = lib.buildScene({ cadenceSpm, localHour, weather: 'rain', setting, occasion, minutesUntil });
  if (!keys.has(scene.key)) offKey += 1;
  if (!(scene.energy >= 0.05 && scene.energy <= 1 && scene.valence >= 0.05 && scene.valence <= 0.95)) outOfRange += 1;
  const reason = lib.reasonFor(song, scene);
  if (reason.length > TUNING.reasonMaxChars || !reason.startsWith(scene.occasionLine)) longReason += 1;
}
check(keys.size === 840 && offKey === 0, 'every scene with an occasion keeps one of the 840 keys');
check(outOfRange === 0, 'energy and valence stay in range');
check(longReason === 0, 'the reason line leads with the occasion and fits');
check(lib.reasonFor(song, tenOut) === 'Game in 10 min · at the peak · 128 BPM', `reason: ${lib.reasonFor(song, tenOut)}`);
check(lib.reasonFor(song, plain) === 'euphoric and triumphant for a quiet sunny afternoon', 'the reason without an occasion is unchanged');

console.log('\nnextOccasion');
const now = Date.UTC(2026, 10, 15, 18, 0);
const min = 60 * 1000;
const at = (startMin, lengthMin, title, allDay = false) => ({ title, startMs: now + startMin * min, endMs: now + (startMin + lengthMin) * min, allDay });
const from = (events) => lib.nextOccasion(lib.occasionEventsFrom(events), now);
check(from([at(45, 120, 'Game vs Lakers')])?.id === 'game' && from([at(45, 120, 'Game vs Lakers')])?.minutesUntil === 45, 'a game 45 min out');
check(from([at(90, 60, 'Game vs Lakers')]) === null, 'too far out');
check(from([at(-200, 60, 'Morning run')]) === null, 'already over');
check(from([at(-10, 60, 'Gym')])?.minutesUntil === -10, 'running now');
check(from([at(30, 60, 'Budget review')]) === null, 'an unknown title is no occasion');
check(from([at(-600, 1440, 'Birthday party', true)]) === null, 'all-day events are ignored');
check(from([at(-30, 90, 'Deep work'), at(40, 60, 'Game')])?.id === 'focus', 'the running event holds until the next one is close');
check(from([at(-30, 90, 'Deep work'), at(8, 60, 'Game')])?.id === 'game', 'the next event takes over at its peak');
check(!JSON.stringify(lib.occasionEventsFrom([at(45, 120, 'Game vs Lakers')])).includes('Lakers'), 'no title survives classification');

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nall checks passed');
