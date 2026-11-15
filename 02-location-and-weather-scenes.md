# Feature plan 2: Location and weather scenes

Written Nov 15, 2026. Read `PLAN.md` and `AGENTS.md` first. This file fills in milestones 4, 5 and 7 of `PLAN.md` and adds place names. It depends on plan 1 for the queue.

## Goal

The app reads pace, location, weather and local time, turns them into a scene, and keeps the queue filled with songs for that scene without the user touching the phone. Each play is logged with a readable place name so the OST can say "Rain on 4th Street, 6:12pm".

## Decisions already made

- No playlists. The scene feeds the in-app queue from plan 1.
- Matching is rules plus one vector search. No LLM or embedding call at runtime.
- The phone sends `localHour`. Convex does not know the user's timezone.
- Weather is fetched in the `next:pick` action and cached for 10 minutes per rounded coordinate.
- When the pedometer is unavailable, the app starts in simulated mode.

## Check before writing code

1. Read the Expo SDK 58 docs for `Pedometer` (`expo-sensors`) and `expo-location`, including reverse geocoding and its rate limits.
2. Pick the weather API. Open-Meteo is the candidate because it needs no key; confirm its terms allow this use and note the response fields for condition and temperature.
3. Confirm the embedding dimension before declaring the vector index (the plan assumes 256).

## Scene definition (`convex/tuning.ts`)

All thresholds live in this one file.

| Part | Values | Source |
| --- | --- | --- |
| Pace word | still (under 20 spm), stroll (20 to 90), walk (90 to 125), brisk (125 to 150), run (over 150) | Cadence, smoothed over 10 seconds; GPS speed as a fallback |
| Weather | clear, cloud, rain | Weather API condition, or `weatherOverride` from the simulator |
| Time of day | morning (6 to 12), afternoon (12 to 17), evening (17 to 22), late night (22 to 6) | `localHour` |

- Scene key: `<pace>-<weather>-<time>`, for example `walk-rain-evening`. That is 5 x 3 x 4 = 60 rows in `scenes`, each with a label and a precomputed embedding.
- The pace thresholds above are starting values. Tune them on a real walk.
- Energy, valence and target BPM follow the rules already in `PLAN.md`.

## Backend (`convex/`)

- `next:pick` (action): args deviceId, cadenceSpm, speedMps, lat, lon, localHour, nudge, weatherOverride. Builds the scene, runs the matching steps from `PLAN.md`, returns the scene and a batch of tracks (plan 1).
- `weatherCache`: key by coordinates rounded to 2 decimals (about 1 km). Reuse a row younger than 10 minutes.
- `scenes`: loaded by `pipeline/push.py`. `embed.py` must generate all 60 keys from the same pace, weather and time lists as `tuning.ts`; keep the lists in one shared JSON file so they cannot drift.
- `plays.context`: add `placeLabel` (string), `sceneKey`, and coordinates rounded to 3 decimals (about 100 m). Do not store full-precision coordinates.
- Measure `next:pick` latency and write the number in `PLAN.md`. If it is slow, prefetch the next batch while a track plays.

## App (`src/`)

- `src/lib/context.ts`: samples cadence, speed and coordinates every 5 seconds, smooths cadence over 10 seconds, and exposes one `Context` value through React context. The simulator screen can override any field.
- Scene change detection runs on the phone: compute the pace word and time of day locally, take weather from the last `next:pick` response, and tell the queue when the scene key changes or target energy moves by more than 0.25 for 10 seconds.
- Place label: reverse geocode on the phone when a play is logged, not on every sample. Cache by rounded coordinate. Prefer street name, then neighborhood, then city. If it fails, log the play without a label.
- Permissions: add motion and location (while in use) to `app.json` with clear usage strings. This needs a new native build; Expo Go will not show the change on Android.
- Now screen: show live cadence, weather and the scene label, plus the reason line for the current pick.
- Foreground only for the hackathon. Background sensing is out of scope.

## Stretch: recurring themes

The first stretch goal in `PLAN.md`, and it builds directly on this feature.

- When a place (rounded coordinate) plus time-of-day bucket has been visited on 3 or more separate days, its most-played unskipped song becomes that place's theme.
- `next:pick` puts the theme first in the batch when the user arrives there, at most once per day, with the reason "Your theme for this place".
- One internal query on `plays`; no new table needed at first.

## Steps

1. `tuning.ts`, the shared scene list, and `scenes` rows imported. *Done when* the Convex dashboard shows 60 scenes.
2. `next:pick` with weather cache and matching. *Done when* `npx convex run next:pick` with cadence 60 and with cadence 160 returns clearly different batches, and latency is written down.
3. Simulator wired to the queue. *Done when* dragging cadence from 60 to 160 changes the song within 12 seconds on a phone and in a Revyl proof run.
4. Live sensors and permissions. *Done when* a walk around the building changes the music without touching the phone. Real phone only.
5. Place labels on plays. *Done when* plays from that walk show street or place names in the Convex dashboard.
6. Stretch: recurring themes.

## Risks

| Risk | Fallback |
| --- | --- |
| Pedometer lags or is missing | 10-second smoothing; GPS speed; simulated mode |
| Reverse geocoding is rate limited or returns nothing | Cache by cell; fall back to the weather and time in the title ("Rainy evening, 6:12pm") |
| Weather API is down | Use the last cached value; default to "clear" |
| Too few songs survive the BPM filter | The `by_bpm` fallback in `PLAN.md`; then one vector search per BPM band |
| Location data feels invasive | Rounded coordinates only; shared OSTs show labels, never coordinates (plan 3) |

## Kickoff prompt

```
Read PLAN.md, AGENTS.md and plans/02-location-and-weather-scenes.md. Build
steps 1 and 2: the scene definitions in convex/tuning.ts and the next:pick
action. Read the Convex docs for vector search and actions before writing
them. Measure next:pick latency. Stop after step 2 and tell me how to verify
it. One branch, one pull request, no push without my approval.
```
