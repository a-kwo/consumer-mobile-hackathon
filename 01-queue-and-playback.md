# Feature plan 1: In-app queue and Spotify playback

Written Nov 15, 2026. Read `PLAN.md` and `AGENTS.md` first. Where this file and `PLAN.md` disagree, this file wins for playback only.

## Goal

The app keeps a short "Up next" queue in memory and tells Spotify to play one track at a time. No playlists are created and nothing is added to the user's Spotify queue or library. When Spotify is not connected, the same queue plays Deezer previews inside the app.

## Decisions already made

- The queue lives in the app. Spotify only ever knows the track that is playing now.
- Full tracks play in the Spotify app, controlled remotely. Audio never streams inside Score on mobile.
- Deezer previews stay as the fallback player. Revyl cloud devices and the stage simulator use it.
- Matching still uses no Spotify data. Spotify is used for playback and for looking up each song's URI.
- This overrides the `PLAN.md` rule "Do not use any Spotify API", for playback only.

## Check before writing code

1. Make one `PUT /v1/me/player/play` call by hand with a real Premium account and a Development Mode app. I have not confirmed the player endpoints survive the February 2026 Development Mode restrictions.
2. Confirm the limits: the listener needs Spotify Premium, the app owner needs Premium, and a Development Mode app allows 5 users. Add every demo account to the app's user list.
3. Read Spotify's Developer Terms and the policy notes on the player endpoints (no commercial streaming apps, no synchronizing Spotify content).
4. Read the Expo SDK 58 docs for `expo-auth-session` and `expo-secure-store` before using them.

## Backend changes (`convex/`)

- `songs`: add optional `spotifyUri` (string) and `durationMs` (number).
- `next:pick`: return `tracks`, an array of up to 5, instead of one `track`. Step 5 of the matching logic becomes "shuffle the top five and return them all". Each track has songId, deezerId, spotifyUri, title, artist, coverUrl, bpm, durationMs, reason. Drop `previewUrl` from the response.
- New action `tracks:previewUrl` (args: deezerId) returns a fresh Deezer preview URL. The app calls it just before a preview plays, so the "never store preview URLs" rule still holds with a queue.
- The recent-plays exclusion stays server-side and still reads `plays`.

## Pipeline change (`pipeline/`)

- New script `spotify.py`, run after `enrich.py`: look up each song by ISRC with Spotify search (`q=isrc:<code>&type=track`) and store `spotifyUri` and duration. Search returns at most 10 results per call; one is enough.
- Check which auth flow search accepts now. Client-credentials access to metadata was reported as restricted in February 2026; use a user token from the app owner if so.
- Songs with no Spotify match keep working in preview mode. Do not drop them.

## App changes (`src/`)

**`src/lib/player.ts`: one interface, two implementations**

```ts
interface Player {
  play(track: QueuedTrack): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(): Promise<void>;
  getState(): PlayerState;          // playing, positionMs, durationMs
  onEnding(cb: () => void): void;   // fires once, near the end of the track
}
```

- `PreviewPlayer`: the existing two `expo-audio` players with a 2-second crossfade.
- `SpotifyPlayer`: calls the Spotify Web API from the phone. `play` sends `PUT /me/player/play` with `{ uris: [spotifyUri] }`. It polls `GET /me/player` every 3 seconds for progress and fires `onEnding` when under 2 seconds remain. It never calls the add-to-queue endpoint.

**`src/lib/queue.ts`**

- State: `current`, `upNext` (max 5), `sceneKey`.
- Refill: call `next:pick` when `upNext` has 1 track left.
- Mood change (the existing rule: target energy moved by more than 0.25 for 10 seconds, or the scene key changed): fetch a new batch and replace `upNext`.
- Small change: let the current track finish. Big change (pace word changed, or energy moved by 0.4 or more): switch now.
- Never flush more than once every 20 seconds, so a cadence hovering on a threshold does not thrash.
- Skip and nudges: advance to the next queued track; a nudge also refetches.

**Spotify connection**

- A "Connect Spotify" button in a settings sheet. Authorization Code with PKCE, scopes `user-modify-playback-state` and `user-read-playback-state`. Tokens in secure storage, with refresh.
- Error handling: no active device (ask the user to open Spotify, then retry; list devices and transfer if needed); 403 or a non-Premium account (fall back to previews and say why); 429 (back off).
- Default to `PreviewPlayer` when Spotify is not connected or the pedometer is unavailable (cloud devices).

**Logging**

- `plays:log` fires when a track starts. Mark `skipped` if the track was replaced before 30 seconds.

## Steps

1. `next:pick` returns a batch; `tracks:previewUrl` added. *Done when* `npx convex run next:pick` returns 5 tracks.
2. `Player` interface and `PreviewPlayer` refactor, plus `queue.ts`. *Done when* the Now screen plays through a queue of previews and a simulated mood change replaces "Up next". This is the step Revyl can prove.
3. `spotify.py` and the `spotifyUri` field. *Done when* 50 songs have URIs in the Convex dashboard.
4. Spotify connect and `SpotifyPlayer`. *Done when* a Premium phone plays three queued tracks back to back in the Spotify app, and a slider change in the simulator switches the track within 12 seconds.
5. Show "Up next" on the Now screen (next 2 tracks, small).

## Risks

| Risk | Fallback |
| --- | --- |
| Player endpoints blocked in Development Mode | Ship preview-only and add an "Open in Spotify" link per track |
| No crossfade on Spotify | Accept a hard cut; keep crossfades in preview mode |
| App is killed mid-song, so nothing plays next | Accept for the demo. Later: add only the single next track to Spotify's queue as a safety net |
| Polling hits rate limits | Poll every 3 seconds only while playing; stop when backgrounded |
| Venue wifi breaks Spotify login on stage | Demo in preview mode; show Spotify in the backup video |

## Kickoff prompt

```
Read PLAN.md, AGENTS.md and plans/01-queue-and-playback.md. Build steps 1 and 2
only: batch picks, the Player interface, PreviewPlayer and the in-app queue.
Do not write any Spotify code yet. Stop after step 2 and tell me how to verify
it. One branch, one pull request, no push without my approval.
```
