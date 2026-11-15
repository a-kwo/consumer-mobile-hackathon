# Feature plan 5: Visual identity

Written Nov 15, 2026. Read `PLAN.md` and `AGENTS.md` first. This file defines how Score looks: color, type, shapes, and the cymatic figure on the Now screen. It applies to every screen. Plan 4 still owns OST covers.

Reference sample (design canvas, three artboards: Now, OST, Album colors): https://claude.ai/artifact/R9DYzc44uCNVgfS2dY7NQb

The sample is a browser mockup. Every number below is the value used in it and is a starting point to tune on a phone. Nothing here has been measured on a device.

## Goal

Score looks like the liner notes of a record: warm paper, dark ink, a serif for titles. The album cover is the centerpiece of the Now screen. Around it, fine grains settle into a cymatic figure (the pattern sand or water makes on a vibrating surface), drawn in a color taken from the cover and shaped by the song. The effect stays in the background and never competes with the cover or the text.

## Decisions already made

- Light mode, warm. Cream paper ground, brown-black ink. No dark theme for the hackathon.
- The album cover is the hero of the Now screen. The cymatic figure sits behind and around it.
- The figure is made of particles (grains) on the nodal lines of a resonance pattern, with a very faint liquid wash under the lines.
- The figure's color comes from the album cover of the song that is playing. The cover is the only source of accent color on screen.
- Weather and time of day are told in words (the italic scene line), not in color.
- The animated figure appears on the Now screen only. Other screens are still and carry the identity through paper, ink and type.
- OST covers stay ASCII art as in plan 4. Cymatics is the in-app theme, not the cover style.
- No monospace uppercase labels, no outlined pill buttons, no neon accents, no stat grids. Those made the first drafts look generic.

## Check before writing code

1. Pick the drawing layer. The sample uses an HTML canvas, which React Native does not have. `@shopify/react-native-skia` is the candidate; confirm in its docs and the Expo SDK 58 docs that it is supported, and how to draw a few thousand points per frame. It has native code, so it needs a new native build (Revyl does this on the next PR; locally it needs a development build, not Expo Go).
2. Measure the figure on a real phone: frame rate with 3,200 grains while a preview plays. If it drops frames, use the fallbacks in Risks.
3. Fonts: Fraunces and Hanken Grotesk are both on Google Fonts. Confirm how to load them in Expo SDK 58 (`expo-font` docs) and that the italic and the 500 weight of Fraunces are included.
4. Cover color: test the extraction rule below on 10 real covers from the song database before wiring it in. Check a white cover, a black cover, a photo and a multi-color illustration.
5. Check that the platform's reduced-motion setting can be read in Expo SDK 58, for the still version of the figure.

## Tokens (`src/theme.ts`)

### Color

| Token | Value | Use |
| --- | --- | --- |
| `paper` | `#F4EDE1` | Screen background |
| `paperRaised` | `#FBF7EF` | Placeholder covers, sheets |
| `paperSunk` | `#EAE1D2` | Secondary buttons |
| `hairline` | `#DDD3C3` | Dividers, progress track |
| `ink` | `#2B2420` | Primary text, play button, Share button |
| `inkSoft` | `#4A413A` | Reason line |
| `inkMuted` | `#6F655C` | Artist, scene line, meta text, inactive tabs |
| `albumInk` | computed per song | Grains, wash, progress fill. Never text |

`inkMuted` on `paper` is about 4.9:1, so it passes for small text. Do not go lighter for text.

### Album ink

The raw cover color is not used directly: a pale cover would vanish on paper and a neon one would shout. Convert the cover's dominant color to HSL, then:

- saturation = min(saturation, 0.60)
- lightness = clamp(lightness, 0.30, 0.40)
- hue unchanged

Examples from the sample: cover `#F2D675` (pale yellow) becomes an olive gold; cover `#C8432B` stays a slightly deeper red.

Album ink is for graphics only. Its contrast against paper is not guaranteed for text, so titles and labels stay in `ink` and `inkMuted`. If a cover has no usable color (near grey), use `inkMuted`.

### Type

| Role | Face | Size / line | Weight |
| --- | --- | --- | --- |
| Wordmark "Score" | Fraunces | 22 | 500 |
| Song title (Now) | Fraunces | 34 / 40 | 500 |
| Screen title (OST) | Fraunces | 30 / 34 | 500 |
| OST entry title | Fraunces | 17 / 22 | 400 |
| Scene line | Fraunces italic | 16 / 20 | 400 |
| Artist | Hanken Grotesk | 16 / 22 | 400 |
| Reason line, body | Hanken Grotesk | 15 / 22 | 400 |
| Buttons, tabs | Hanken Grotesk | 14 | 500 (active tab 600) |
| Meta line | Hanken Grotesk | 13 / 20 | 400 |
| Playback times | Hanken Grotesk, tabular figures | 12 / 16 | 400 |

Titles use letter-spacing of -0.01em. Text is sentence case everywhere. The scene reads as a sentence, for example "A slow rainy walk, late at night".

### Shape

| Element | Spec |
| --- | --- |
| Screen padding | 24 left and right |
| Cover (Now) | 272 square, radius 6, shadow `0 22 44 rgba(74,52,30,0.18)` plus `0 2 6 rgba(74,52,30,0.14)` |
| Cover thumbnail (lists) | 48 square, radius 4, no shadow |
| Play button | 60 circle, `ink` fill, `paper` icon |
| Skip button | 48 circle, `paperSunk` fill, `ink` icon |
| Calmer, More energy | 48 high, radius 14, `paperSunk` fill, `ink` text, equal widths either side of play and skip |
| Primary button (Share) | 44 high, radius 14, `ink` fill, `paper` text |
| Progress bar | 2 high, `hairline` track, `albumInk` fill |
| Tab bar | Text only, 56 high, hairline on top. Active tab in `ink` with a 16 x 2 underline; inactive in `inkMuted` |

Every touch target is at least 44 high. No icons in the tab bar. No fake status bar in mockups.

## The cymatic figure

### Where it sits

- A region 390 wide and about 417 high, centered on the cover's center.
- Grains live in a ring between 100 and 216 from that center. The cover (half-width 136) hides the middle, so a band of the figure shows around the album.
- A radial fade to `paper` runs from fully clear at radius 150 to fully paper at 214. The figure is gone before it reaches the header or the text below.

### The pattern

With `r` the distance from the center, `θ` the angle and `φ` a slow rotation:

```
f(r, θ) = cos(n · (θ + φ)) · sin(k · r) + 0.6 · sin(1.5 · k · r + 1)
```

Grains collect where `f` is zero (the nodal lines). That gives lobed, petal-like rings with `n`-fold symmetry.

### What the song drives

| Input | Controls | Rule |
| --- | --- | --- |
| Track energy (0 to 1) | Number of lobes | `n = 3 + round(5 · energy)`, so 3 to 8 |
| Track energy | Line spacing | `k = 2π / λ`, `λ = 44 − 18 · energy` (in points at a 390-wide screen) |
| Track energy | How much settled grains shimmer | `floor = 0.08 + 0.3 · energy` |
| Track BPM | How fast the figure turns | `dφ/dt = 0.03 rad/s · (bpm / 120)` |
| Album cover | Color | `albumInk` |

A calm song gives a few broad lobes that barely move. An energetic song gives a finer, livelier figure.

### Grains

- 3,200 grains, each a 1.3 point square in `albumInk` at 50% opacity.
- Each frame, every grain takes a random step in x and y of up to `floor + 3.2 · |f| + kick` points. Grains far from a nodal line move a lot; grains on a line almost stop. That is what makes them settle.
- A step that would leave the ring is discarded.
- Start grains at random positions in the ring. They find the figure in about a second.

### Wash

Under the grains, a soft tint follows the same lines: opacity `0.09 · exp(−f² / 0.06)` in `albumInk`, computed on a coarse grid (3-point cells) and scaled up smoothly. It keeps a liquid feel and makes the figure readable when grains are sparse.

### States

| State | Behavior |
| --- | --- |
| Playing | Grains move, figure turns |
| Song change (new track, skip, nudge) | `kick = 4` points, decaying to 0 over 420 ms. Grains scatter, then resettle into the new figure. Color switches to the new album ink |
| Paused | Grains and rotation stop. Grain opacity x 0.7, wash x 0.6 |
| Reduced motion | No animation. Settle the grains off-screen (about 220 steps) and draw once per song |
| App in background | Stop the frame loop |

On Spotify playback there is no crossfade (plan 1), so the scatter-and-resettle is the only transition the user sees. Keep it.

### Tuning (`src/theme.ts`, figure section)

Keep these three in one place, as the sample's sliders do:

- `grains`: 3,200 (try 1,000 to 6,000)
- `strength`: 0.5. Grain opacity is `0.25 + 0.5 · strength`; wash peak is `0.18 · strength`
- `motion`: 0.5. Scales shimmer and rotation by `0.3 + 1.4 · motion`

## Screens

**Now**

Top to bottom: wordmark and "Live sensors" (or "Simulated"); the cover with the figure around it; the scene line; song title; artist; reason line; progress bar with elapsed time, "Playing" or "Paused", and total time; the control row (Calmer, play or pause, skip, More energy); one meta line ("92 steps/min · Rain"); the tab bar.

The sample's meta line also shows an energy number. That was there to make the nudges visible in the mockup; drop it or keep it as the team prefers.

"Up next" (plan 1, step 5) is not in the sample. When it is added, use two rows in the list style below, under the meta line.

**OST**

Wordmark and date; the OST cover (plan 4) at 116 square beside the title "Today's soundtrack", track count and Share button; then the tracklist. Each row: 48 cover thumbnail, the generated entry title in Fraunces, "Song · Artist" in `inkMuted`, a replay button. Rows are separated by hairlines. No figure, no motion.

**Simulator and Feed**

Not designed yet. Use the same tokens: paper ground, Fraunces for titles, `paperSunk` controls, hairline dividers, no figure.

## Data changes

- `songs`: add `coverColor` (hex string). Compute it once in the pipeline, after `enrich.py` has the cover URL: download the cover, shrink it, take the dominant color, store the raw hex. This avoids a color-extraction library on the phone and costs nothing at runtime. The clamp to album ink happens in the app so it can be tuned.
- `next:pick`: each returned track needs `energy` and `coverColor` alongside `bpm` and `coverUrl`.
- If a song has no `coverColor`, the app uses `inkMuted`.

## App (`src/`)

- `src/theme.ts`: the tokens and figure tuning above.
- `src/lib/albumInk.ts`: hex to HSL, the clamp, back to hex.
- `src/components/CymaticFigure.tsx`: props `energy`, `bpm`, `color`, `playing`, `trackId`. A change of `trackId` triggers the kick. Owns its frame loop and stops it when paused, hidden or backgrounded.
- `src/components/NowCover.tsx`: the figure, the fade, and the cover image stacked in that order.
- Load Fraunces and Hanken Grotesk at startup; hold the splash screen until they are ready so text does not jump.

## Steps

1. Tokens and fonts, applied to the Now and OST screens with no figure. *Done when* both screens match the sample's type and color, and a Revyl proof shows them.
2. `coverColor` in the pipeline and in `next:pick`; `albumInk.ts`. *Done when* the progress bar changes color with each song.
3. `CymaticFigure`, still version only (settle once per song, draw once). *Done when* each song shows a different figure in its album's color in a Revyl proof screenshot.
4. Animate it: per-frame steps, rotation, kick on song change, paused state. *Done when* it runs on a real phone with a preview playing, and the measured frame rate is written here.
5. Reduced-motion and background handling.

Steps 1 to 3 give the whole look with no animation risk. If time runs out, stop after step 3.

## Risks

| Risk | Fallback |
| --- | --- |
| The drawing library does not work with Expo SDK 58 or the Revyl build | Ship the still figure as a pre-rendered image per (lobes, spacing) pair, tinted at runtime; or drop the figure and keep tokens and type |
| Thousands of grains per frame are too slow on a phone | Fewer grains (1,500); update every second frame; or the still version from step 3 with a crossfade between songs |
| Battery drain during a long walk | Stop the loop when the screen is off or the app is backgrounded; lower the frame rate after 30 seconds without a touch |
| The dominant color of a cover is ugly or misleading (a thin colored border, a photo's skin tone) | Take the most saturated of the top three colors; fall back to `inkMuted` |
| The figure distracts from the cover on busy album art | Lower `strength`; the wash can be turned off on its own |
| ASCII OST covers (plan 4) were designed with dark terminal palettes and may clash with paper | Open question for plan 4: give `GENRE_PALETTES` a paper ground and ink foreground, or keep the cover as a deliberate dark object on the light page |
| A proof screenshot catches grains mid-scatter | Proofs use the still version (as with simulated mode on cloud devices) |

## Kickoff prompt

```
Read PLAN.md, AGENTS.md and plans/05-visual-identity.md. Build step 1 only:
src/theme.ts with the tokens, the two fonts, and the Now and OST screens
restyled to match. Read the Expo SDK 58 docs for font loading first. Do not
add a drawing library or the cymatic figure yet. Stop after step 1 and tell
me how to verify it. One branch, one pull request, no push without my
approval.
```
