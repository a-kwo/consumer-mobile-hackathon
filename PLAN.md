# Rubato — Hackathon Build Plan (Convex + Revyl edition)

The app was named Score until Nov 15; older sections and file names still say Score.

Adapted on Nov 15, 2026 from `Score — Hackathon Build Plan.pdf`. The product scope is unchanged. What changed is the backend (Convex replaces FastAPI and SQLite), the repo layout, hosting, and how each change is verified (Revyl Proof of Changes on every pull request).

## Status (Nov 15, end of prototype build)

- **Built and running on iOS and Android cloud devices:** all four screens, the playback engine, the Convex backend, the share card and the replay bar.
- **Library:** 1,929 labeled songs and 840 scene embeddings are in the dev deployment. Every song has an iTunes preview.
- **Previews come from iTunes, not Deezer.** Deezer refuses requests from Convex's servers, so the pipeline matches each song to an iTunes track and the backend looks the preview up there. Deezer is still used offline for seeding, cover art and tempo analysis.
- **Milestones 1 to 6, 8 and 9 are done** against the dev deployment; the production deployment in milestone 6 is not created yet.
- **Milestone 7 (live sensors) is built but untested:** Revyl's devices are simulators, so the pedometer, location and permission prompts have never run on hardware.
- **Milestone 10 (demo prep) is not started.**
- **Foreground only:** locking the phone stops the music.

## Scope

The demo build is a phone app that reads your pace, location, weather and time, and plays the existing song that best fits the moment. It logs every pick and turns the day into a shareable soundtrack.

**In the build**

- Live context sensing: step cadence, speed, weather, time of day.
- Song matching against a pre-labeled database of about 1,500 songs.
- Playback of 30-second previews with crossfades between picks.
- A simulator screen with sliders, so the demo works from a stage and on Revyl's cloud devices.
- A daily soundtrack (OST) screen built from the play log.
- One social feature: a share card for the OST and a seeded friends feed.

**Cut for the hackathon**

- Generated music. All audio is existing songs.
- Full-length playback through Spotify or Apple Music.
- Reading messages, microphone crowd detection, live heart rate.
- Accounts and login. A device ID identifies the user.
- Recurring themes per place or person. This is the first stretch goal.

## What changed from the original plan

| Area | Original | Now | Why |
| --- | --- | --- | --- |
| Backend | FastAPI, SQLite, numpy | Convex functions and tables in `convex/` | Already provisioned and wired into the app |
| Hosting | Laptop plus a tunnel, or a small cloud host | Convex cloud | Removes the venue-wifi tunnel risk entirely |
| API | Five REST endpoints | Convex queries, mutations and one action | The app calls them through the Convex client; OST and feed update live |
| Similarity | numpy cosine over a blob column | Cosine in TypeScript over BPM-matched songs, and a Convex vector index when still | Convex has no numpy; vector search is built in |
| Tempo data | Deezer BPM | Deezer BPM, or tempo measured from the preview audio | Deezer has a BPM for only about half of tracks |
| Embeddings | An embedding API | A local model in the pipeline | No key needed |
| Tuning file | `server/tuning.py` | `convex/tuning.ts` | Same idea, same single file |
| Repo layout | `app/` and `server/` | App at the repo root, `convex/` beside it, `pipeline/` for Python | The Revyl config and builds already point at the root |
| Pipeline output | Writes the SQLite file the server reads | Works in a local SQLite file, then imports into Convex | Keeps the scripts resumable; Convex is the runtime store |
| Local hour | Backend derives it | The phone sends `localHour` | Convex has no idea of the user's timezone |
| Verification | Manual checks on a phone | Manual checks plus Revyl Proof of Changes on each PR | Every PR is built for iOS and Android and exercised on a cloud device |
| Distribution | Expo Go | Revyl preview builds, plus Expo Go or a development build for local work | Pedometer is not available in Expo Go on Android |

## Stack and decisions

| Layer | Choice | Why |
| --- | --- | --- |
| Mobile app | Expo SDK 58, TypeScript, Expo Router, routes in `src/app/` | One codebase for iOS and Android |
| Backend and database | Convex, project `consumer-mobile-hackathon` in team `consumermobilehackathon` | Hosted, typed end to end, reactive queries |
| Sensors | `Pedometer` from `expo-sensors`, `expo-location` | Cadence and speed without native code |
| Audio | `expo-audio`, two players for crossfade | Plays remote MP3 previews |
| Weather | A free weather API called from the `next` action, cached in Convex | Keeps keys off the phone and the call off the hot path |
| Song data | Last.fm tags, Deezer BPM and previews, LLM labels | No Spotify data, so no policy conflict |
| Matching | Rules plus vector similarity, no LLM or embedding call at runtime | A pick must feel instant |
| Builds and review | Revyl: `preview` profile, Proof of Changes on pull requests | Proof on real cloud devices for every change |

**Rules that follow from AGENTS.md**

- Read the Expo SDK 58 docs (`https://docs.expo.dev/versions/v58.0.0/`) before using any Expo module. Do not rely on remembered module names or APIs.
- Add packages with `npx expo install <package>`.
- Never create or edit `ios/` or `android/` by hand. Permissions and native settings go in `app.json` and config plugins.
- Run `npx expo lint` and `npx tsc --noEmit` before calling a milestone done.

**Checked by hand on Nov 15**

- Deezer search, track lookup, cover art and 30-second MP3 previews all work without a key. Use plain `artist title` queries: the quoted `artist:"…" track:"…"` syntax returned nothing.
- Deezer's BPM field is unreliable: 11 of 20 well-known catalogue tracks had one, and only 3 of 25 chart tracks. The pipeline therefore measures tempo from the preview audio whenever Deezer has none.
- Open-Meteo returns current weather without a key.
- The iTunes Search API returns previews without a key, as the fallback when a Deezer preview fails.

**Still to confirm**

- Latency of `next:pick`. The original 300 ms target is unmeasured on Convex and includes a Deezer call. Measure it at milestone 4; the app preloads the next pick so playback never waits on it.

## Repo layout

```
src/app/            Expo Router routes: (tabs)/ for Now, Simulator, OST, Feed; pushed screens beside it
src/components/     UI components; src/components/ui/ is the shared kit
src/theme/          design tokens
src/lib/            the engine: sensing, simulator state, audio crossfade, session, replay, device ID
convex/             schema.ts, tuning.ts, functions, and lib/ for pure shared logic
shared/vocab.json   ids, embedding phrases and vocabularies shared by TypeScript and Python
pipeline/           seed.py, enrich.py, analyze.py, label.py, embed.py, push.py, .env.example
.revyl/config.yaml  Revyl project, build recipes, Proof of Changes
PLAN.md             this file
```

## Architecture

Context flows one way, from the phone to Convex and back as a song pick.

1. **Sense.** The app samples cadence (steps per minute), speed and coordinates every 5 seconds. The simulator screen can override cadence, hour, weather and setting.
2. **Send.** The app calls the `next:pick` action about 9 seconds before the current preview ends, so the next song is preloaded, or immediately when the context has changed sharply or the user taps skip or a nudge.
3. **Build the scene.** The action resolves the weather (simulator override, else cached weather for the coordinates, else unknown) and reduces everything to a scene: pace, weather, time of day, setting, target energy, target valence, target BPM and a label such as "slow rainy walk in the city, late night". `convex/lib/scene.ts` does this; the app runs the same code for the simulator preview.
4. **Match.** The action looks up the precomputed embedding for the scene key, gathers candidate songs, ranks them, and returns one track with a fresh preview URL and a one-line reason.
5. **Play.** The app crossfades to the new preview over 2 seconds and shows the track, the scene label and the reason.
6. **Log.** When playback of a pick starts, the app calls the `plays:log` mutation. The log feeds the OST screen and the feed, which are reactive queries and update on their own.

## Data model

Tables are defined in `convex/schema.ts`. Convex adds `_id` and `_creationTime` to every document.

| Table | Fields | Indexes |
| --- | --- | --- |
| `songs` | deezerId, isrc, title, artist, album, coverUrl, bpm, energy, valence, tension, moods, scenes, timeOfDay, social, vocal, confidence, embedding (384 numbers) | `by_deezerId`, `by_bpm`, vector index `by_embedding` |
| `scenes` | key (`pace\|weather\|timeOfDay\|setting`), text, embedding | `by_key` |
| `plays` | deviceId, deezerId, songTitle, artist, coverUrl, bpm, moods, startedAt, context (object), sceneKey, sceneLabel, reason, title, skipped | `by_device_startedAt` |
| `profiles` | deviceId, displayName, avatarEmoji, seeded | `by_deviceId` |
| `weatherCache` | cell (rounded lat and lon), weather, temperatureC, fetchedAt | `by_cell` |

- The `scenes` table is new. A scene key is one of 5 paces x 7 weathers x 4 times of day x 6 settings, so there are 840 keys. The pipeline embeds a sentence for each one, so `next:pick` never calls an embedding model.
- Songs are identified by `deezerId` everywhere outside the `songs` table, and a play copies the song details in. A library re-import replaces every song `_id`, and the play log survives it.
- Embeddings come from `BAAI/bge-small-en-v1.5` (384 dimensions), run locally by the pipeline. No embedding API key is needed.

## Convex functions

These replace the five REST endpoints. Argument and return shapes are in `convex/lib/validators.ts`.

| Function | Kind | Arguments | Returns |
| --- | --- | --- | --- |
| `health:get` | query | none | `{ ok: true }` |
| `next:pick` | action | deviceId, cadenceSpm, speedMps, lat, lon, localHour, setting, weatherOverride, nudge, energyBias, excludeDeezerIds | scene, track (or null) and an error code |
| `plays:log` | mutation | deviceId, deezerId, startedAt, context, sceneKey, sceneLabel, reason | play id |
| `plays:markSkipped` | mutation | deviceId, playId | nothing |
| `ost:get` | query | deviceId, dayStart, dayEnd | entries with a generated title each, top moods, a one-line summary |
| `feed:list` | query | deviceId | recent soundtracks from other profiles, newest first |
| `profiles:ensure`, `profiles:update`, `profiles:get` | mutations, query | deviceId, displayName, avatarEmoji | the profile |
| `tracks:preview` | action | deezerId | a fresh preview URL for replay |
| `weather:current` | action | lat, lon | weather and temperature, cached |
| `seed:friends` | internal | none | three fake friends whose soundtracks grow through the day |

**Rules**

- `nudge` is optional and is one of `calmer`, `more_energy`, `skip`. The app carries the resulting energy bias for three picks and sends it as `energyBias`; the server stays stateless.
- `weatherOverride` and `setting` are set by the simulator screen. Live sensing sends coordinates instead.
- `next:pick` is an action because it calls Deezer and the weather API, and because Convex vector search only runs in actions. Its database reads go through internal queries.
- The server excludes the last 20 songs played on the device. `excludeDeezerIds` adds songs the app already holds.
- Fetch the Deezer preview URL at request time by `deezerId`. Preview links expire, so never store them. If Deezer fails, fall back to the iTunes Search API.
- `next:pick` must not call an LLM or an embedding model. Everything it needs is precomputed in `songs` and `scenes`.
- Weather is cached per rounded coordinate for 10 minutes in `weatherCache`.
- All matching weights and thresholds live in `convex/tuning.ts`.
- Server-side keys are Convex environment variables, set with `npx convex env set`. They never go in the app or the repo.

## Screens

The app has four screens behind a bottom tab bar.

| Screen | Shows | Controls |
| --- | --- | --- |
| Now | Cover art, title, artist, scene label, the reason for the pick, live cadence and weather, a visible playback indicator | Start and stop, skip, calmer, more energy |
| Simulator | The current context values | Sliders for cadence and hour, pickers for weather and setting, a toggle between live sensors and simulated values |
| OST | Today's plays as a tracklist with a generated title per entry, such as "Rain on 4th Street, 6:12pm" | Tap to replay a preview, share button that renders a card image |
| Feed | Other people's daily OSTs, seeded with three fake friends | Tap an OST to play through its previews |

The Now screen is the product. Build it first and spend the polish time there.

Two additions for Revyl's cloud devices, which have no real steps and whose proofs are screenshots:

- When the pedometer is unavailable, the app starts in simulated mode instead of showing an error.
- The Now screen shows playback state visibly (a progress bar and a playing or paused state), so a proof run can confirm a song is playing without hearing it.

## Design direction

Score should feel like a film, not a music player. Your day is the movie; the app is the title sequence.

- Dark only. Near-black background with an ambient wash of colour from the current cover art, blurred and dimmed, crossfading in step with the audio.
- Scene labels and titles are set in a display serif (Instrument Serif), like title cards. Interface text is the system font; small labels are upper case and letter-spaced, like film credits.
- The cover art pulses gently at the song's BPM. Controls give haptic feedback.
- Copy uses film-score words: a pick is a "cue", the day is the "original soundtrack".

## Song database pipeline

Six Python scripts in `pipeline/` build the database offline. The first five write to a local SQLite working file so any step can be rerun; the last one loads Convex. Run the full chain on 50 songs and check the labels before scaling to 1,500.

1. `seed.py` collects candidate songs by mood and scene. With a Last.fm key it calls `tag.getTopTracks` for about 50 tags, such as "rainy day", "late night", "workout" and "melancholy", then `track.getTopTags` per song. Without one it searches Deezer playlists for the same tags and keeps each playlist's name as the tag. It dedupes by artist and title.
2. `enrich.py` searches Deezer for each song and stores deezerId, ISRC, BPM and cover URL. It drops songs with no match or no preview.
3. `analyze.py` downloads each preview and measures tempo and loudness from the audio. The measured tempo is used when Deezer has no BPM. Songs with neither are dropped.
4. `label.py` sends artist, title, tags, BPM and the audio measurements to an LLM in batches of 20 and gets back JSON matching the `songs` fields. Moods and scene tags come from the fixed vocabularies in `shared/vocab.json`. Rows with confidence under 0.6 are dropped.
5. `embed.py` writes one sentence per song from its labels and embeds it locally. It also embeds one sentence for each of the 840 scene keys, built from the phrases in `shared/vocab.json`.
6. `push.py` exports `songs.jsonl` and `scenes.jsonl` and loads them into Convex with `npx convex import --table <name> --replace`.

The network scripts need rate limiting, retries and a resume flag. Pipeline keys live in `pipeline/.env`; commit only `pipeline/.env.example`.

## Matching logic

Matching is deterministic rules plus one similarity score, so it is fast and easy to tune by hand. Every number below is a starting value in `convex/tuning.ts` to adjust by ear.

**Context to scene**

- Energy starts from cadence: 0.2 when still, 0.5 at a 100 steps-per-minute walk, 0.9 at a 160 run, interpolated between.
- Hour shifts energy: subtract 0.15 between 10pm and 6am.
- Weather sets valence: 0.7 in clear weather, 0.5 in cloud, 0.35 in rain, with values for fog, snow and storms.
- Setting adds small shifts, such as more energy at the gym.
- A nudge shifts energy by 0.2 in the requested direction for the next three picks.
- Target BPM equals cadence when moving. Half and double time count as a match.
- The scene label is a template: pace word, weather, setting, time of day. Its key maps to one row in `scenes`.

**Scene to song**

1. Candidates when moving: every song within 8% of target BPM, including half and double time, read through the `by_bpm` index.
2. Candidates when still: the 256 songs closest to the scene embedding, from a vector search. 256 is Convex's maximum per search.
3. Remove the last 20 songs played on this device.
4. Score each remaining song: 0.5 x cosine similarity to the scene embedding, plus 0.3 x energy closeness, plus 0.2 x valence closeness.
5. Pick at random from the top five, so repeat walks do not sound identical. The random pick happens in the action.
6. If fewer than five songs survive, widen the BPM window, then fall back to the vector search pool.

**When to switch songs**

- When the current preview has 3 seconds left.
- When target energy has moved by more than 0.25 and stayed there for 8 seconds.
- When the user taps skip or a nudge.

## Deployment and environments

**Convex**

- The current deployment is a personal dev deployment. `.env.local` (gitignored) points the local app at it, and `build.env` in `.revyl/config.yaml` points Revyl's cloud builds at it.
- Each teammate who runs `npx convex dev` gets their own dev deployment with empty tables. For app-only work, a teammate should set `EXPO_PUBLIC_CONVEX_URL` to the shared deployment instead and leave Convex functions to the backend owner.
- A dev deployment changes whenever `npx convex dev` is running and a file is saved. Before the demo, at milestone 6, create the production deployment with `npx convex deploy`, import the songs into it, and point `build.env` in the Revyl config at the production URL. Demo builds then run against a backend that nobody is editing.
- Proof of Changes runs write real rows (plays) into whichever deployment the build points at.

**Revyl**

- Project `324f484b-f67e-468a-a549-b664c7cb9af0`, connected to `a-kwo/consumer-mobile-hackathon`, Proof of Changes on.
- The `preview` profile builds a standalone iOS simulator app and an Android APK with `expo prebuild` plus Xcode or Gradle. It needs no EAS account.
- After any edit to `.revyl/config.yaml`, run `revyl config validate` and `revyl config push`. Pull requests use the published version, not the local file.
- Adding a library with native code, or a permission in `app.json`, needs a new native build. Revyl does that on the next PR; locally it needs a development build, not Expo Go.

**Workflow**

1. One branch and one pull request per milestone, or per screen inside a milestone.
2. Revyl builds the PR, opens it on a cloud device, exercises the change and posts a verdict with screenshots.
3. Merge when the proof passes and the manual acceptance check below passes.
4. Convex function changes reach the dev deployment when `npx convex dev` is running, not when the PR merges. Push backend changes before opening the PR that depends on them.

## Milestones

Build in this order and cut from the bottom if time runs out. Milestones 2 and 3 can run in parallel on two machines, since one is the data pipeline and the other is the app.

1. **Scaffold.** Mostly done: the Expo app is scaffolded, Convex is connected, both Revyl builds pass, and the iOS build shows live Convex data on a cloud device. *Still to do:* commit and push the app to `main`, add `health:get`. *Done when* a first pull request gets a Proof of Changes comment.
2. **Song database, small.** Run the pipeline on 50 songs and import them into Convex. *Done when* a teammate has listened to 10 previews and agrees with the labels, and the songs are visible in the Convex dashboard.
3. **Now screen with fake data.** Two audio players, crossfade, cover art, skip, visible playback state. Remove the template screens and the `messages` placeholder. *Done when* the app plays a hardcoded list of preview URLs back to back with smooth fades, and the PR's proof shows the Now screen playing.
4. **Matching action.** `next:pick` with the rules above. *Done when* `npx convex run next:pick` with cadence 60 and with cadence 160 returns clearly different songs, and the measured latency is written down here.
5. **Simulator wired to matching.** Sliders drive `next:pick`. *Done when* dragging cadence from 60 to 160 changes the song within 12 seconds, on a phone and in a Revyl proof run.
6. **Song database, full, and production.** Scale the pipeline to 1,500 songs, create the Convex production deployment, import, and repoint the Revyl build. *Done when* every mood in the vocabulary has at least 20 songs and a fresh Revyl build plays from production.
7. **Live sensors.** Pedometer, location, weather. Add the motion and location permissions in `app.json`. *Done when* a walk around the building changes the music without touching the phone. This one is verified on a real phone only; cloud devices do not walk.
8. **Play log and OST screen.** *Done when* the walk from milestone 7 appears as a titled tracklist, and simulated plays appear in a proof run.
9. **Share card and feed.** *Done when* the OST exports as an image and the feed shows three seeded friends.
10. **Demo prep.** Record a backup video of a real walk. Rehearse the simulator demo twice. Optionally run a Revyl Atlas exploration to catch broken screens.

**Stretch, in order:** recurring themes tied to a place or time; a friend's leitmotif; Apple Music full-track playback.

## Before the clock starts

- [ ] Read the hackathon rules on pre-written code and pre-built data. If data is allowed, build the song database early.
- [ ] Create a Last.fm API account and key.
- [ ] Make one Deezer search call and one track call by hand. Confirm BPM, ISRC and a playable preview URL come back.
- [ ] Read the Last.fm and Deezer API terms for what prototypes may do.
- [ ] Get an LLM API key and an embedding model key with enough quota for 1,500 songs.
- [ ] Invite teammates to the Convex team and the Revyl organization.
- [ ] Decide how each teammate runs the app locally: Expo Go on iOS, a development build on Android.
- [ ] Install current Node and Python 3.12 or newer on the build machines.
- [ ] Write the mood and scene vocabularies, about 30 terms each.
- [ ] Write the list of 50 Last.fm seed tags.
- [ ] Decide who owns the Convex backend and pipeline, and who owns the app.
- [x] Pick the backend host. Convex; no tunnel needed.
- [x] Set up builds. Revyl preview builds pass for iOS and Android.

## Risks and fallbacks

| Risk | Fallback |
| --- | --- |
| Deezer returns no BPM, or BPM is often zero | Have the LLM estimate a tempo band (slow, mid, fast) and filter on that |
| Deezer previews fail or are blocked | Use Apple's iTunes Search API previews, matched by artist and title |
| Preview URLs expire mid-session | Always fetch the URL inside `next:pick`, never cache it on the phone |
| `next:pick` is slow because of the Deezer and weather calls | Weather is already cached; prefetch the next pick while the current preview plays |
| Too few songs match the target BPM | Widen the BPM window, then fall back to the vector search pool |
| Pedometer updates lag by several seconds | Smooth over a 10-second window; fall back to GPS speed |
| Pedometer is missing in Expo Go on Android and on cloud devices | Development build for Android teammates; simulated mode as the default when it is unavailable |
| Sensors or audio stop when the app is backgrounded | Keep the app in the foreground for the demo; background mode is post-hackathon |
| A teammate's `npx convex dev` changes the backend mid-demo | Demo builds point at the production deployment from milestone 6 |
| Proof runs fill the play log with test rows | Use a distinct device ID prefix for cloud devices and filter it out of the feed |
| A proof cannot hear audio | The visible playback state on the Now screen |
| LLM labels are wrong for obscure songs | Seed from the top of each Last.fm tag list and enforce the confidence cutoff |
| Picks feel random to judges | Show the reason line on the Now screen, such as "112 BPM, matches your pace; rainy, late" |

## Kickoff prompt for the coding agent

```
You are building Score, a hackathon mobile app. The full plan is in PLAN.md.
Read it and AGENTS.md before writing code.

Summary: an Expo (React Native, TypeScript) app reads the user's step
cadence, location, weather and time of day, and a Convex backend picks the
existing song that best fits the moment from a pre-labeled database. The app
plays 30-second previews with crossfades and logs each pick into a daily
soundtrack. Revyl builds every pull request and posts a Proof of Changes.

Rules:
- Follow the milestones in PLAN.md in order. Stop after each one and tell me
  how to verify its acceptance check.
- Repo layout: Expo app at the repo root with routes in src/app/, Convex
  functions in convex/, the Python data scripts in pipeline/.
- Read the Expo SDK 58 docs for the audio, pedometer and location modules
  before using them. Install packages with npx expo install.
- next:pick must not call an LLM or an embedding model. Measure its latency.
- Songs are identified by deezerId outside the songs table.
- Never store Deezer preview URLs. Fetch them at request time by deezerId.
- Do not use any Spotify API.
- Server keys are Convex environment variables. Pipeline keys come from
  pipeline/.env. Create pipeline/.env.example and never commit real keys.
- Keep it simple: no auth, no state library beyond React context and Convex
  hooks, no tests beyond a smoke test for next:pick.
- All matching weights and thresholds live in convex/tuning.ts.
- One branch and one pull request per milestone. Do not push to main or open
  a pull request without my approval.
- After editing .revyl/config.yaml, run revyl config validate and
  revyl config push.
- Run npx expo lint and npx tsc --noEmit before calling a milestone done.

Start with milestone 3: the Now screen with fake data.
```

For a second agent working in parallel, swap the last line for milestone 2 and tell it to stay inside `pipeline/`.
