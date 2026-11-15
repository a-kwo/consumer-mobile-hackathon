# Score song pipeline

Builds the song library and the 840 scene embeddings offline, as JSONL files ready for
`npx convex import`. Working data lives in `work.db` (SQLite), `cache/` and `out/`, all gitignored.
Every step is resumable: rerun it and it continues where it stopped.

## Setup

```bash
cd pipeline
/opt/homebrew/bin/python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env        # then put ONE label key in .env
```

Keys are read only from `pipeline/.env`, never from the shell. No ffmpeg is needed.

## Steps

Run from `pipeline/` with `.venv/bin/python`. Every script takes `--limit N` and `--help`.

| Step | Command | What it does |
| --- | --- | --- |
| 1 | `seed.py` | Finds Deezer playlists for about 120 mood, scene, genre, decade and tempo phrases, plus charts. Keeps the phrases as crowd tags. Selects about 2,300 popular, deduplicated candidates, at most 4 per artist. |
| 2 | `enrich.py` | Looks up each candidate on Deezer: ISRC, cover, BPM, release date, genre. Drops tracks with no preview. |
| 2b | `itunes.py` | Finds the same recording in the iTunes Store, where the app's previews come from, and stores its track id. Drops songs with no match. Slow: Apple allows about 20 calls a minute. |
| 3 | `analyze.py` | Downloads each Deezer preview, measures tempo and audio features, deletes the audio. `--report` prints agreement with Deezer's BPM. |
| 4 | `label.py` | Labels songs with an LLM in batches of 20. `--dry-run` prints a prompt; `--self-test` checks parsing. Drops songs with confidence under 0.6. |
| 5 | `embed.py` | Embeds the 840 scene keys and every labeled song with `BAAI/bge-small-en-v1.5`, locally. |
| 6 | `push.py` | Writes `out/scenes.jsonl` and `out/songs.jsonl`, validates every row against `convex/schema.ts`, prints the import commands. It does not run them. |
| | `report.py` | Library health: counts, histograms, coverage per mood and scene tag, top songs for a scene key. `--include-unchecked` also counts songs still waiting for the iTunes check. |

Typical full run:

```bash
.venv/bin/python seed.py
.venv/bin/python enrich.py
.venv/bin/python itunes.py &        # slow, runs alongside the rest
.venv/bin/python analyze.py
.venv/bin/python label.py --limit 50   # check these before labeling everything
.venv/bin/python label.py
.venv/bin/python itunes.py             # finish the songs that were labeled meanwhile
.venv/bin/python embed.py
.venv/bin/python push.py
.venv/bin/python report.py
```

Then, from the repository root:

```bash
npx convex import --table scenes --replace -y pipeline/out/scenes.jsonl
npx convex import --table songs --replace -y pipeline/out/songs.jsonl
```

## Topping up a thin mood or tempo band

```bash
.venv/bin/python seed.py --extra "trip hop=trip hop" --artist "Brian Eno=ambient" --limit 2400
```

`--limit` is the new total of selected candidates. Then rerun the steps: each one only handles
the new songs.

## Notes

- **Tempo.** The final `bpm` is Deezer's when it has one (about half of tracks), otherwise the
  tempo measured from the preview. Both are folded by octaves into 60 to 185 BPM; the app counts
  half and double time as a match. The measurement is a comb over the autocorrelation of the
  onset envelope (the beat period plus its half, double and quadruple), tuned on tracks that
  have a Deezer BPM. At export, calm songs are stored at the pulse a listener feels
  (`felt_bpm` in `common.py`): energy under 0.3 with a tempo over 100, or energy under 0.4 with
  a tempo over 140, is halved.
- **iTunes match.** `itunes.py` follows the rules of `convex/lib/preview.ts`: the artist must
  match, the base title must match, and version words (remix, live, acoustic...) must be the
  same. A search result more than 8 seconds longer or shorter than the Deezer track is rejected
  as another cut. A song the search misses is looked up exactly, through its album's UPC.
  Only songs with a match are exported, each with its `itunesTrackId`.
- **Embeddings.** A song is embedded as `moods, scene tags, times of day`; a scene as its mood
  and tag hints from `shared/vocab.json` (weight 0.75) blended with its descriptive phrases
  (weight 0.25). Every vector has the mean embedding of the vocabulary words subtracted and is
  normalised again. Without that step all cosines sit between 0.55 and 0.97 and the similarity
  term barely moves the score; with it they spread over roughly 0 to 0.9.
- **Previews.** Deezer preview URLs are signed and expire, so they are never stored. iTunes
  preview URLs are kept in `work.db` only, never exported. Downloaded audio is deleted as soon
  as it has been analysed.
- **Last.fm.** If `LASTFM_API_KEY` is set, `seed.py` also takes top tracks per tag from Last.fm.
  This path has not been run.
