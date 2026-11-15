# Feature plan 3: OST sharing, photos and the feed

Written Nov 15, 2026. Read `PLAN.md` and `AGENTS.md` first. This file fills in milestones 8 and 9 of `PLAN.md`. It depends on plan 2 (plays with place labels) and uses covers from plan 4.

## Goal

Each day's plays become an OST: a titled tracklist with a cover and the user's photos. The user can share it as an image, show it to friends in a feed, or make it public.

## Decisions already made

- No accounts. A device ID identifies the user, with a display name and emoji in `profiles`.
- The feed is seeded with three fake friends for the demo.
- Shared OSTs show place names, never coordinates.
- Every OST has a cover. Covers come from plan 4; until one is ready, show the procedural placeholder.

## Check before writing code

1. Read the Expo SDK 58 docs for `expo-image-picker` and `expo-sharing`.
2. Choose the library that renders a view to an image (the usual one is `react-native-view-shot`). Confirm it works with SDK 58 and install it with `npx expo install`. It has native code, so it needs a new build.
3. Read the Convex docs for file storage (upload URLs and serving files).

## Data model (`convex/schema.ts`)

| Table | Fields | Indexes |
| --- | --- | --- |
| `osts` | deviceId, date (YYYY-MM-DD, local), title, visibility (`private`, `friends`, `public`), hideLocations (boolean), coverStorageId (optional), coverStatus, coverMode, coverStyle | `by_device_date`, `by_visibility_date` |
| `photos` | ostId, playId (optional), storageId, takenAt | `by_ost` |
| `follows` | followerDeviceId, followedDeviceId | `by_follower` |

- An `osts` row is created by the first play of the day. `plays` gains `ostId`.
- `profiles` gains `shareCode`, a short random code used to add a friend.

## Backend (`convex/`)

| Function | Kind | What it does |
| --- | --- | --- |
| `ost:get` | query | deviceId, date. Returns the OST, its plays in order with track details, a title per entry, and photos. Reactive |
| `ost:update` | mutation | Sets title, visibility, hideLocations. Only the owning device |
| `photos:uploadUrl` | mutation | Returns a Convex upload URL |
| `photos:attach` | mutation | ostId, storageId, takenAt. Links the photo to the play that was active at `takenAt` |
| `feed:list` | query | deviceId, tab (`friends` or `everyone`). Friends: OSTs with visibility `friends` or `public` from followed and seeded profiles. Everyone: `public` only. Excludes cloud-device test rows |
| `follows:add` | mutation | deviceId, shareCode |
| `seed:friends` | internal mutation | Three fake friends, each with a day of plays, an OST and a cover |

- Entry titles are built from the play: `<Weather word> on <placeLabel>, <time>`. When there is no place label or `hideLocations` is on, use `<Weather word> <time of day>, <time>`.
- The OST title defaults to a template such as "Sunday, Nov 15". The user can rename it.
- Every mutation checks that the caller's deviceId owns the row. A device ID is not real security; say so in the README and do not present public sharing as private.

## App (`src/`)

**OST screen**

- Header: cover, title (editable), date, a visibility control.
- Tracklist: one scene card per play with title, song, artist and any attached photo. Tap to play the preview, or open the track in Spotify when it has a `spotifyUri`.
- "Add photo": pick from the camera roll, upload, attach. A photo taken during a song lands on that song's card.
- "Share": renders the share card to an image and opens the system share sheet.

**Share card**

- A fixed 1080 x 1920 view rendered off screen: cover on top, OST title, date, the first 5 or 6 entries, a small Score mark.
- Track titles and artist names are text only. Do not put Deezer or Spotify cover art for individual tracks on the exported image unless their terms allow it; check first.

**Feed screen**

- Two tabs: Friends and Everyone.
- A card per OST: cover, owner name and emoji, title, entry count. Tap to open it read-only and play through its previews.
- "Add friend" by share code.

## Out of scope for the hackathon

- Comments, likes, notifications, user search.
- A public web page per OST. Sharing is an image; a link can come later through a Convex HTTP action.
- Moderation tools. This matters once photos are public; see risks.

## Steps

1. `osts` table, `ost:get`, entry titles, OST screen with the tracklist. *Done when* the walk from plan 2 appears as a titled tracklist, and simulated plays appear in a Revyl proof run.
2. Share card and export. *Done when* the OST exports as an image from a real phone.
3. `seed:friends` and the Friends tab. *Done when* the feed shows three seeded friends and their OSTs play.
4. Photos: upload, attach, show on cards and on the share card.
5. Visibility, share codes and the Everyone tab.

## Risks

| Risk | Fallback |
| --- | --- |
| Public photos with no moderation | Keep the Everyone tab seeded-only for the demo; ship real public sharing only with report and hide |
| Location leaks through titles | `hideLocations` per OST; default it on for `public` |
| Proof runs fill the feed with test rows | A device ID prefix for cloud devices, filtered out in `feed:list` |
| View-to-image library fails on SDK 58 | Share a plain text tracklist through the share sheet |
| Photos are large | Resize on the phone to about 1600 px on the long side before upload |

## Kickoff prompt

```
Read PLAN.md, AGENTS.md and plans/03-ost-sharing-and-feed.md. Build step 1:
the osts table, ost:get and the OST screen. Read the Convex docs for schema
changes and file storage first. Stop after step 1 and tell me how to verify
it. One branch, one pull request, no push without my approval.
```
