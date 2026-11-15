"""Step 1: collect candidate tracks from Deezer playlists and charts.

For each search phrase (derived from the mood and scene vocabularies, plus genres, decades and
tempo bands) find the best few public playlists, take their tracks and remember the phrase as a
crowd tag. Then select a diverse, popular, deduplicated set of candidates for the next steps.

    python seed.py                      # crawl every phrase, select up to --limit candidates
    python seed.py --limit 60 --phrases 8
    python seed.py --only "calm,sleep"  # crawl just these tags (to top up thin moods)
    python seed.py --extra "trip hop=trip hop" --artist "Brian Eno=ambient"   # top-up crawl
    python seed.py --select-only        # redo the selection without any network calls

Resumable: API responses are cached in work.db, and selection only ever adds candidates.
"""
from __future__ import annotations

import argparse
import math
import re
from collections import Counter, defaultdict

from common import Deezer, connect, fold, log, norm_key, normalize_artist, read_env, version_flags

# (search query, crowd tag). The tag is what the labeler sees; several queries may share a tag.
PHRASES: list[tuple[str, str]] = [
    # --- scene tags (shared/vocab.json sceneTags)
    ("rainy day", "rainy day"),
    ("late night vibes", "late night"),
    ("after hours", "after hours"),
    ("sunrise", "sunrise"),
    ("sunday morning", "sunday morning"),
    ("golden hour", "golden hour"),
    ("city walk", "city walk"),
    ("walking", "walking"),
    ("nature walk", "nature walk"),
    ("hiking", "hiking"),
    ("commute", "commute"),
    ("night drive", "night drive"),
    ("road trip", "road trip"),
    ("running", "running"),
    ("workout", "workout"),
    ("gym motivation", "gym"),
    ("focus", "focus"),
    ("study", "study"),
    ("coffee shop", "coffee shop"),
    ("cooking", "cooking"),
    ("dinner", "dinner"),
    ("party hits", "party"),
    ("pregame", "pregame"),
    ("getting ready", "getting ready"),
    ("beach", "beach"),
    ("summer", "summer"),
    ("winter", "winter"),
    ("snow day", "snow day"),
    ("cozy", "cozy"),
    ("heartbreak", "heartbreak"),
    ("sad songs", "sad songs"),
    ("wind down", "wind down"),
    ("chill", "chill"),
    ("sleep songs", "sleep"),
    ("stargazing", "stargazing"),
    ("victory songs", "victory"),
    ("hype", "hype"),
    ("morning", "morning"),
    ("acoustic", "acoustic"),
    ("main character", "main character"),
    # --- moods (shared/vocab.json moods)
    ("calm", "calm"),
    ("dreamy", "dreamy"),
    ("dream pop", "dream pop"),
    ("melancholy", "melancholy"),
    ("nostalgia", "nostalgic"),
    ("throwback", "throwback"),
    ("uplifting", "uplifting"),
    ("hopeful", "hopeful"),
    ("feel good", "feel good"),
    ("happy", "happy"),
    ("euphoria", "euphoric"),
    ("love songs", "romantic"),
    ("romantic", "romantic"),
    ("soft", "tender"),
    ("bittersweet", "bittersweet"),
    ("lonely", "lonely"),
    ("moody", "moody"),
    ("brooding", "brooding"),
    ("dark", "dark"),
    ("suspense", "tense"),
    ("mysterious", "mysterious"),
    ("ethereal", "ethereal"),
    ("epic cinematic", "epic cinematic"),
    ("film scores", "film score"),
    ("epic", "epic"),
    ("triumphant", "triumphant"),
    ("energy boost", "energetic"),
    ("driving rock", "driving"),
    ("rage", "aggressive"),
    ("playful", "playful"),
    ("fun", "fun"),
    ("groovy", "groovy"),
    ("funk", "funk"),
    ("sultry", "sultry"),
    ("confidence boost", "confident"),
    ("protest songs", "rebellious"),
    ("warm and cozy", "warm"),
    ("mystery", "mysterious"),
    ("reflective", "reflective"),
    # --- tempo bands for moving scenes
    ("running 160 bpm", "running 160 bpm"),
    ("running 170 bpm", "running 170 bpm"),
    ("running 180 bpm", "running 180 bpm"),
    ("140 bpm running", "running 140 bpm"),
    ("150 bpm running", "running 150 bpm"),
    ("power walk", "power walk"),
    # --- genres and decades, for spread
    ("60s hits", "60s"),
    ("70s hits", "70s"),
    ("80s hits", "80s"),
    ("90s hits", "90s"),
    ("00s hits", "2000s"),
    ("10s hits", "2010s"),
    ("classic rock", "classic rock"),
    ("indie", "indie"),
    ("alternative", "alternative"),
    ("hip hop classics", "hip hop"),
    ("r&b", "r&b"),
    ("soul classics", "soul"),
    ("jazz classics", "jazz"),
    ("classical essentials", "classical"),
    ("peaceful piano", "piano"),
    ("ambient", "ambient"),
    ("electronic", "electronic"),
    ("house music", "house"),
    ("techno", "techno"),
    ("drum and bass", "drum and bass"),
    ("synthwave", "synthwave"),
    ("metal", "metal"),
    ("punk", "punk"),
    ("folk", "folk"),
    ("country hits", "country"),
    ("reggae", "reggae"),
    ("latin hits", "latin"),
    ("disco", "disco"),
    ("blues", "blues"),
    ("lo-fi", "lo-fi"),
    ("trip hop", "trip hop"),
    ("post rock", "post rock"),
    ("neoclassical", "neoclassical"),
    ("bossa nova", "bossa nova"),
]

# Deezer genre ids for chart seeding (GET /genre).
CHART_GENRES: dict[int, str] = {
    0: "popular",
    132: "pop",
    116: "hip hop",
    152: "rock",
    113: "dance",
    165: "r&b",
    85: "alternative",
    106: "electro",
    466: "folk",
    144: "reggae",
    129: "jazz",
    84: "country",
    98: "classical",
    173: "film score",
    464: "metal",
    169: "soul & funk",
    153: "blues",
    197: "latin",
}

BAD_PLAYLIST = re.compile(
    r"rain sounds?|white noise|brown noise|sleep sounds?|nature sounds?|asmr|podcast|meditat|binaural|"
    r"karaoke|kids|baby|bebe|lullab|horbuch|horspiel|bruits?|pour dormir|sons de|sonidos|schlaf|"
    r"\bnoise\b|frequenc|\bhz\b|audiobook|sleep music|deep sleep|yoga|\bspa\b|\bcovers?\b|tribute|"
    r"instrumental covers|8d|nightcore|sped up|slowed|berceuse|setlist|\bsoundtrack\b|^100%|warm[- ]?up",
    re.IGNORECASE,
)

# Playlists curated for one national market: their songs are not recognisable elsewhere.
REGIONAL = re.compile(
    r"brasil|brazil|deutschland|france|francaise|italy|italia|benelux|espana|mexico|nederland|turkiye|"
    r"polska|maroc|arab|indonesia|sertanejo|funk carioca|pagode|piseiro|variete|schlager|\b\d0er\b|"
    r"\banos\b|deutsch|francais|rap fr|bollywood|k-?pop|j-?pop|anime",
    re.IGNORECASE,
)

# Seasonal songs sound wrong for most of the year.
SEASONAL = re.compile(
    r"christmas|xmas|x-mas|\bnoel\b|weihnacht|navidad|\bsanta\b|jingle bell|let it snow|winter wonderland|"
    r"rudolph|sleigh ride|silent night|snowman|mistletoe|\bholiday\b|halloween|hanukkah",
    re.IGNORECASE,
)

BAD_ARTIST = re.compile(
    r"^deezer$|\b(white|brown|pink|green) noise\b|\brain (sounds?|makers?)\b|\bnature sounds?\b|"
    r"\bsounds? of nature\b|\b(deep )?sleep (music|sounds?|baby|aid|songs?|therapy|academy|club)\b|"
    r"\bmusic for (deep )?sleep\w*\b|\bsleeping (music|baby)\b|\bmeditation\b|\brelax(ing|ation)\b|"
    r"\byoga\b|\bspa\b|\bbinaural\b|\basmr\b|\blullab(y|ies)\b|\bkaraoke\b|\btribute\b|"
    r"\bcover (band|nation|team|masters|guru|girls?)\b|\bworkout (music|hits|mix|remix)\b|\bfitness\b|"
    r"\bpower music\b|\bameritz\b|\bstudio (allstars|all stars|group|musicians|sound)\b|"
    r"\bsound effects?\b|\bthunderstorms?\b|\bocean (waves|sounds)\b|\bplaylist\b|^various artists$|"
    r"\baudiobook\b|\bpodcast\b|\bzen\b|\bchakra\b|\bhealing\b|"
    r"\b(study|focus|background|concentration|reading|cafe|restaurant|elevator|dinner|cooking|"
    r"coffee shop|bgm) (music|jazz|lounge|vibes|ensemble|club|playlist|zone|academy)\b|"
    r"\bkidz bop\b|\brockabye baby\b|\bvitamin string quartet\b|\bpiano (covers?|tribute)\b|\bhits\b|"
    r"\bdj ?mix\b|\bmusic (lab|academy|universe|masters)\b|\bmade famous\b|\boriginally performed\b|"
    r"\bchampions? league\b|\bnursery\b|\bcocomelon\b|\bpinkfong\b|\bsuper simple\b",
    re.IGNORECASE,
)

BAD_TITLE = re.compile(
    r"white noise|brown noise|pink noise|rain sounds?|\b\d{2,4} ?hz\b|binaural|delta waves|"
    r"theta waves|alpha waves|\basmr\b|sleep music|thunderstorm sounds?|ocean waves|nature sounds?|"
    r"\bpodcast\b|\bepisode \d|\bchapter \d|\bkapitel\b|\bteil \d|\bskit\b|^(intro|outro|interlude)$|"
    r"\binterlude\b|\bfolge \d",
    re.IGNORECASE,
)

MIN_DURATION = 90
MAX_DURATION = 720
ARTIST_CAP = 4
CHART_ROUNDS = 10


# --------------------------------------------------------------------------- crawl


def store_tracks(conn, items: list[dict], tag: str, source: str) -> int:
    stored = 0
    for item in items:
        if not isinstance(item, dict) or item.get("type", "track") != "track":
            continue
        track_id = item.get("id")
        artist = (item.get("artist") or {}).get("name")
        title = item.get("title")
        if not track_id or not artist or not title:
            continue
        album = item.get("album") or {}
        has_preview = bool(item.get("preview")) or bool(item.get("has_preview"))
        drop = None
        if item.get("readable") is False:
            drop = "seed:not readable"
        elif not has_preview:
            drop = "seed:no preview"
        conn.execute(
            """INSERT INTO tracks(deezer_id, title, artist, artist_id, album, album_id, duration, rank,
                                  norm_key, version_flags, drop_reason)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(deezer_id) DO UPDATE SET rank = MAX(COALESCE(rank, 0), excluded.rank)""",
            (
                track_id, title, artist, (item.get("artist") or {}).get("id"), album.get("title"),
                album.get("id"), item.get("duration"), item.get("rank") or 0,
                norm_key(artist, title), version_flags(title), drop,
            ),
        )
        conn.execute(
            "INSERT OR IGNORE INTO track_tags(deezer_id, tag, source) VALUES (?, ?, ?)",
            (track_id, tag, source),
        )
        stored += 1
    conn.commit()
    return stored


def playlist_tracks(api: Deezer, playlist: dict, max_tracks: int) -> list[dict]:
    items = list(((playlist.get("tracks") or {}).get("data")) or [])
    total = playlist.get("nb_tracks") or len(items)
    while len(items) < min(total, max_tracks):
        page = api.get(f"/playlist/{playlist['id']}/tracks", {"index": len(items), "limit": 100})
        data = (page or {}).get("data") or []
        if not data:
            break
        items.extend(data)
    return items[:max_tracks]


_STOP_WORDS = {"songs", "hits", "music", "vibes", "the", "classics", "essentials", "boost", "motivation", "and"}


def title_match(query: str, title: str) -> float:
    """Share of the query's words that appear in a playlist title (0 to 1)."""
    words = [word for word in re.findall(r"[a-z0-9]+", fold(query)) if word not in _STOP_WORDS]
    if not words:
        return 0.0
    folded = fold(title)
    hits = 0
    for word in words:
        if len(word) <= 4:
            pattern = rf"\b{re.escape(word)}s?\b"
        elif len(word) <= 7:
            pattern = rf"\b{re.escape(word)}"
        else:
            pattern = rf"\b{re.escape(word[:-2])}"
        if re.search(pattern, folded):
            hits += 1
    return hits / len(words)


def crawl_phrase(api: Deezer, conn, query: str, tag: str, per_phrase: int, max_tracks: int) -> int:
    """Pick the best few playlists for a phrase: title must match, then editors and fan counts."""
    found = api.get("/search/playlist", {"q": query, "limit": 25}) or {}
    shortlist = []
    for position, entry in enumerate(found.get("data") or []):
        title = entry.get("title") or ""
        owner = (entry.get("user") or {}).get("name") or ""
        if not entry.get("public", True) or BAD_PLAYLIST.search(fold(title)) or SEASONAL.search(fold(title)):
            continue
        if REGIONAL.search(fold(owner)) or REGIONAL.search(fold(title)):
            continue
        size = entry.get("nb_tracks") or 0
        if size < 25 or size > 600:
            continue
        match = title_match(query, title)
        if match < 0.5:
            continue
        editor = "deezer" in owner.lower()
        shortlist.append((-match, 0 if editor else 1, position, entry["id"], editor, match))
    shortlist.sort()

    scored = []
    for _, _, position, playlist_id, editor, match in shortlist[: per_phrase * 2 + 2]:
        playlist = api.get(f"/playlist/{playlist_id}")
        if not playlist:
            continue
        fans = playlist.get("fans") or 0
        score = 3.0 * match + math.log10(fans + 10) + (1.0 if editor else 0.0) - 0.03 * position
        scored.append((score, playlist))
    scored.sort(key=lambda entry: -entry[0])

    stored = 0
    taken = 0
    seen_titles: set[str] = set()
    for score, playlist in scored:
        if taken >= per_phrase:
            break
        title_key = fold(playlist.get("title") or "")[:18]
        if title_key in seen_titles:  # the same curator's near-identical lists
            continue
        seen_titles.add(title_key)
        taken += 1
        items = playlist_tracks(api, playlist, max_tracks)
        owner = (playlist.get("creator") or {}).get("name") or ""
        conn.execute(
            "INSERT OR REPLACE INTO playlists(id, title, owner, fans, nb_tracks, tag, query) VALUES (?,?,?,?,?,?,?)",
            (playlist["id"], playlist.get("title"), owner, playlist.get("fans"), playlist.get("nb_tracks"), tag, query),
        )
        stored += store_tracks(conn, items, tag, f"playlist:{playlist['id']}")
    return stored


def crawl_charts(api: Deezer, conn) -> int:
    stored = 0
    for genre_id, name in CHART_GENRES.items():
        chart = api.get(f"/chart/{genre_id}/tracks", {"limit": 300 if genre_id == 0 else 100}) or {}
        stored += store_tracks(conn, chart.get("data") or [], f"chart: {name}", f"chart:{genre_id}")
    return stored


def crawl_artist(api: Deezer, conn, name: str, tag: str, top: int = 6) -> int:
    """Top tracks of one artist, to top up a thin mood or tempo band with recognisable music."""
    found = api.get("/search/artist", {"q": name, "limit": 5}) or {}
    artists = found.get("data") or []
    if not artists:
        return 0
    wanted = normalize_artist(name)
    artist = next((entry for entry in artists if normalize_artist(entry.get("name") or "") == wanted), artists[0])
    tracks = api.get(f"/artist/{artist['id']}/top", {"limit": top}) or {}
    return store_tracks(conn, tracks.get("data") or [], tag, f"artist:{artist['id']}")


def crawl_lastfm(api: Deezer, conn, key: str, tags: list[str], per_tag: int = 40) -> int:
    """Optional: Last.fm top tracks per tag, resolved to Deezer by a plain `artist title` search."""
    import requests

    from common import SharedRateLimiter, backoff_sleep

    limiter = SharedRateLimiter("lastfm", 4.0)
    stored = 0
    for tag in tags:
        payload = None
        for attempt in range(4):
            limiter.wait()
            try:
                response = requests.get(
                    "https://ws.audioscrobbler.com/2.0/",
                    params={"method": "tag.gettoptracks", "tag": tag, "limit": per_tag, "api_key": key, "format": "json"},
                    headers={"User-Agent": "music-library-builder/0.1"},
                    timeout=25,
                )
                payload = response.json()
                break
            except (requests.RequestException, ValueError):
                backoff_sleep(attempt)
        for entry in ((payload or {}).get("tracks") or {}).get("track") or []:
            artist = (entry.get("artist") or {}).get("name")
            title = entry.get("name")
            if not artist or not title:
                continue
            hit = api.get("/search", {"q": f"{artist} {title}", "limit": 1}) or {}
            data = hit.get("data") or []
            if data and normalize_artist(data[0]["artist"]["name"]) == normalize_artist(artist):
                stored += store_tracks(conn, data[:1], tag, f"lastfm:{tag}")
    return stored


# --------------------------------------------------------------------------- selection


def eligible(row) -> str | None:
    """Reason a track cannot be a candidate, or None."""
    if row["drop_reason"] and row["drop_reason"].startswith("seed:"):
        return row["drop_reason"]
    if row["version_flags"] == "hard":
        return "seed:alternate version"
    if BAD_ARTIST.search(fold(row["artist"])):
        return "seed:non-music artist"
    if BAD_TITLE.search(fold(row["title"])) or BAD_TITLE.search(fold(row["album"] or "")):
        return "seed:non-music title"
    if SEASONAL.search(fold(row["title"])) or SEASONAL.search(fold(row["album"] or "")):
        return "seed:seasonal"
    duration = row["duration"] or 0
    if duration < MIN_DURATION:
        return "seed:too short"
    if duration > MAX_DURATION:
        return "seed:too long"
    if not row["norm_key"] or row["norm_key"].endswith("|") or row["norm_key"].startswith("|"):
        return "seed:unusable title"
    return None


def select(conn, target: int, per_tag: int, min_rank: int, tag_min_rank: int) -> dict:
    rows = conn.execute("SELECT * FROM tracks").fetchall()
    tags_by_id: dict[int, set[str]] = defaultdict(set)
    sources_by_id_tag: Counter = Counter()
    for tag_row in conn.execute("SELECT deezer_id, tag, source FROM track_tags"):
        tags_by_id[tag_row["deezer_id"]].add(tag_row["tag"])
        sources_by_id_tag[(tag_row["deezer_id"], tag_row["tag"])] += 1

    # One representative per song: plain versions beat live takes and remixes, then popularity.
    groups: dict[str, list] = defaultdict(list)
    rejected: Counter = Counter()
    for row in rows:
        reason = eligible(row)
        if reason:
            rejected[reason] += 1
            continue
        groups[row["norm_key"]].append(row)

    already_selected_keys = {row["norm_key"] for row in rows if row["selected"]}
    artist_count: Counter = Counter(
        row["norm_key"].split("|")[0] for row in rows if row["selected"] and not (row["drop_reason"] or "").startswith("seed:")
    )
    selected_count = sum(1 for row in rows if row["selected"])

    songs = []
    for key, versions in groups.items():
        if key in already_selected_keys:
            continue
        versions.sort(key=lambda r: (r["version_flags"] != "", -(r["rank"] or 0)))
        best = versions[0]
        tags: set[str] = set()
        support: Counter = Counter()
        for version in versions:
            for tag in tags_by_id[version["deezer_id"]]:
                tags.add(tag)
                support[tag] += sources_by_id_tag[(version["deezer_id"], tag)]
        rank = max(version["rank"] or 0 for version in versions)
        songs.append({"id": best["deezer_id"], "key": key, "artist": key.split("|")[0], "rank": rank,
                      "tags": tags, "support": support, "ids": [v["deezer_id"] for v in versions]})

    by_tag: dict[str, list[dict]] = defaultdict(list)
    for song in songs:
        for tag in song["tags"]:
            by_tag[tag].append(song)
    for tag, members in by_tag.items():
        members.sort(key=lambda s: -(s["rank"] / 1e6 + 0.2 * (s["support"][tag] - 1) + 0.03 * len(s["tags"])))

    chosen: list[dict] = []
    chosen_keys: set[str] = set()
    tag_picks: Counter = Counter()

    def take(song: dict, tag: str | None) -> bool:
        if song["key"] in chosen_keys or artist_count[song["artist"]] >= ARTIST_CAP:
            return False
        chosen.append(song)
        chosen_keys.add(song["key"])
        artist_count[song["artist"]] += 1
        for song_tag in song["tags"]:
            tag_picks[song_tag] += 1
        return True

    # Round-robin over tags, so every mood, scene, genre and decade gets its share.
    cursors = {tag: 0 for tag in by_tag}
    ordered_tags = sorted(by_tag)
    progress = True
    round_index = 0
    while progress and selected_count + len(chosen) < target:
        progress = False
        round_index += 1
        for tag in ordered_tags:
            if selected_count + len(chosen) >= target:
                break
            if tag_picks[tag] >= per_tag:
                continue
            # Charts are full of brand-new releases the labeler may not know yet: a smaller share.
            if tag.startswith("chart:") and round_index > CHART_ROUNDS:
                continue
            members = by_tag[tag]
            while cursors[tag] < len(members):
                song = members[cursors[tag]]
                cursors[tag] += 1
                if song["rank"] < tag_min_rank:
                    continue
                if take(song, tag):
                    progress = True
                    break

    # Fill what is left with the most popular, best-supported songs.
    if selected_count + len(chosen) < target:
        rest = sorted(songs, key=lambda s: -(s["rank"] / 1e6 + 0.05 * len(s["tags"])))
        for song in rest:
            if selected_count + len(chosen) >= target:
                break
            if song["rank"] >= min_rank:
                take(song, None)

    for song in chosen:
        conn.execute("UPDATE tracks SET selected = 1 WHERE deezer_id = ?", (song["id"],))
        # The chosen version carries the crowd tags of every version of the song.
        for other_id in song["ids"]:
            if other_id != song["id"]:
                conn.execute(
                    "INSERT OR IGNORE INTO track_tags(deezer_id, tag, source) "
                    "SELECT ?, tag, source FROM track_tags WHERE deezer_id = ?",
                    (song["id"], other_id),
                )
    conn.commit()
    return {"pool": len(rows), "songs": len(groups), "rejected": dict(rejected), "added": len(chosen),
            "selected_total": selected_count + len(chosen)}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--limit", type=int, default=2300, help="total candidates to select (default 2300)")
    parser.add_argument("--phrases", type=int, default=None, help="only crawl the first N phrases")
    parser.add_argument("--only", type=str, default=None, help="comma-separated tags to crawl")
    parser.add_argument("--extra", type=str, action="append", default=[],
                        help="extra phrase as 'query=tag' (repeatable), to top up a thin mood or tempo")
    parser.add_argument("--artist", type=str, action="append", default=[],
                        help="top tracks of an artist as 'name=tag' (repeatable), to top up a thin mood")
    parser.add_argument("--artist-top", type=int, default=6, help="tracks taken per --artist")
    parser.add_argument("--playlists-per-phrase", type=int, default=3)
    parser.add_argument("--max-tracks", type=int, default=250, help="tracks taken per playlist")
    parser.add_argument("--per-tag", type=int, default=45, help="candidates each tag gets before the fill")
    parser.add_argument("--min-rank", type=int, default=300000, help="Deezer rank floor for the fill")
    parser.add_argument("--tag-min-rank", type=int, default=120000, help="Deezer rank floor for per-tag picks")
    parser.add_argument("--no-charts", action="store_true")
    parser.add_argument("--select-only", action="store_true", help="skip crawling, only select")
    args = parser.parse_args()

    conn = connect()
    api = Deezer(conn)

    if not args.select_only:
        phrases = list(PHRASES)
        if args.only:
            wanted = {name.strip() for name in args.only.split(",")}
            phrases = [entry for entry in phrases if entry[1] in wanted]
        if args.artist or args.extra:
            phrases = [] if not args.only else phrases  # a top-up run crawls only what was asked for
        if args.phrases is not None:
            phrases = phrases[: args.phrases]
        for extra in args.extra:
            query, _, tag = extra.partition("=")
            phrases.append((query.strip(), (tag or query).strip()))
        for index, (query, tag) in enumerate(phrases, 1):
            stored = crawl_phrase(api, conn, query, tag, args.playlists_per_phrase, args.max_tracks)
            log(f"[{index}/{len(phrases)}] {query!r} -> tag {tag!r}: {stored} playlist tracks")
        for entry in args.artist:
            name, _, tag = entry.partition("=")
            stored = crawl_artist(api, conn, name.strip(), (tag or "artist pick").strip(), args.artist_top)
            log(f"artist {name.strip()!r} -> tag {tag.strip()!r}: {stored} tracks")
        if not args.no_charts and not args.only and not args.artist and not args.extra:
            log(f"charts: {crawl_charts(api, conn)} tracks")
        lastfm_key = read_env().get("LASTFM_API_KEY")
        if lastfm_key:
            tags = sorted({tag for _, tag in phrases})
            log(f"last.fm: {crawl_lastfm(api, conn, lastfm_key, tags)} tracks")

    summary = select(conn, args.limit, args.per_tag, args.min_rank, args.tag_min_rank)
    log(f"pool {summary['pool']} tracks, {summary['songs']} distinct eligible songs; "
        f"selected +{summary['added']} (total {summary['selected_total']})")
    log("not eligible: " + ", ".join(f"{reason} {count}" for reason, count in sorted(summary["rejected"].items())))
    log(f"deezer calls {api.calls}, cache hits {api.cache_hits}")


if __name__ == "__main__":
    main()
