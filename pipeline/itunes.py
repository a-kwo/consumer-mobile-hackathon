"""Step 2b: find each song in the iTunes Store, where the app's previews come from at runtime.

Deezer refuses requests from Convex's servers, so the backend plays iTunes previews. For each song
this searches https://itunes.apple.com/search?term=<artist title>&entity=song and accepts a
result only when the artist matches, the base title matches and the version words (remix, live,
acoustic, demo...) are the same: the rules of convex/lib/preview.ts. Among accepted results the
canonical studio recording is preferred (closest duration to the Deezer track, not a clean edit,
not a compilation). Songs with no match that has a preview are dropped: they cannot play.

Two ways to find a song, both under Apple's limit of roughly 20 calls a minute per IP:

1. By album. Deezer lists a UPC for every album, and https://itunes.apple.com/lookup?upc=...
   &entity=song returns that exact release with its tracks. Several UPCs fit in one call, so
   this resolves about eight songs per call. The track is picked by title, version and length.
2. By search, for the songs the album lookup did not resolve (about 3 seconds each).

Songs most likely to survive go first: labeled, then scarce material, then by popularity.

    python itunes.py [--limit N]

Resumable: every response is cached in work.db and checked songs are skipped.
"""
from __future__ import annotations

import argparse
import json
import re
import time
import unicodedata

from common import USER_AGENT, SharedRateLimiter, cache_get, cache_put, connect, die, log

SEARCH_URL = "https://itunes.apple.com/search"
LOOKUP_URL = "https://itunes.apple.com/lookup"
CALLS_PER_MINUTE = 19.0
RESULT_LIMIT = 10
# A search result much longer or shorter than the Deezer track is another cut or mix
# ("Zwette Edit", "No Rap Version"), even when the title looks the same.
MAX_LENGTH_GAP_SECONDS = 8.0
UPCS_PER_CALL = 8
LOOKUP_LIMIT = 200  # the most results one lookup returns

VERSION_WORDS = re.compile(
    r"\b(remix|rmx|live|acoustic|demo|instrumental|karaoke|cover|rework|reprise|orchestral|unplugged|"
    r"sped up|slowed|a cappella|acapella)\b"
)
COMPILATION = re.compile(
    r"greatest hits|best of|essential|collection|anthology|now that'?s what|compilation|hits\b|karaoke|"
    r"tribute|soundtrack|playlist|\bmix\b",
    re.IGNORECASE,
)


def normalize_for_match(text: str) -> str:
    """Same rules as normalizeForMatch() in convex/lib/preview.ts."""
    text = unicodedata.normalize("NFKD", text or "")
    text = re.sub(r"[̀-ͯ]", "", text).lower()
    text = re.sub(r"[(\[].*?[)\]]", " ", text)
    text = re.sub(r"\s-\s.*$", " ", text)
    text = re.sub(r"\b(feat|ft|featuring)\b.*$", " ", text)
    text = re.sub(r"['’`]", "", text)
    text = text.replace("&", " and ")
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


def version_words(title: str) -> str:
    return " ".join(sorted(set(VERSION_WORDS.findall((title or "").lower()))))


def overlaps(a: str, b: str) -> bool:
    return bool(a) and bool(b) and (a in b or b in a)


def search_words(text: str) -> str:
    text = re.sub(r"['’`]", "", text)
    return re.sub(r"[^\w]+", " ", text, flags=re.UNICODE).strip()


def search(session, limiter: SharedRateLimiter, conn, term: str) -> dict:
    return fetch(session, limiter, conn, f"itunes:search:{RESULT_LIMIT}:{term}", SEARCH_URL,
                 {"term": term, "entity": "song", "limit": RESULT_LIMIT})


def lookup_album(session, limiter: SharedRateLimiter, conn, upc: str) -> dict:
    return fetch(session, limiter, conn, f"itunes:upc:{upc}", LOOKUP_URL, {"upc": upc, "entity": "song"})


def lookup_albums(session, limiter: SharedRateLimiter, conn, upcs: list[str]) -> dict:
    """Several albums in one call."""
    joined = ",".join(sorted(upcs))
    return fetch(session, limiter, conn, f"itunes:upcs:{joined}", LOOKUP_URL,
                 {"upc": joined, "entity": "song", "limit": LOOKUP_LIMIT})


def fetch(session, limiter: SharedRateLimiter, conn, key: str, url: str, params: dict) -> dict:
    """One rate-limited, cached iTunes call. Backs off on 403 and 429."""
    cached = cache_get(conn, key)
    if cached is not None:
        return cached
    import requests

    for attempt in range(7):
        limiter.wait()
        try:
            response = session.get(url, params=params, timeout=25)
        except requests.RequestException:
            time.sleep(10 * (attempt + 1))
            continue
        if response.status_code in (403, 429) or response.status_code >= 500:
            pause = min(600, 45 * (2 ** attempt))
            log(f"iTunes answered HTTP {response.status_code}: backing off {pause}s")
            time.sleep(pause)
            continue
        if response.status_code != 200:
            return {"results": []}
        try:
            data = response.json()
        except ValueError:
            time.sleep(10)
            continue
        cache_put(conn, key, data)
        return data
    die("iTunes keeps refusing requests: stopping. Rerun later; finished songs are kept.")


def best_match(row, results: list[dict]) -> tuple[dict | None, bool]:
    """(best accepted result with a preview, whether any result matched at all)."""
    want_artist = normalize_for_match(row["artist"])
    want_title = normalize_for_match(row["title"])
    want_version = version_words(row["title"])
    accepted = []
    matched_without_preview = False
    for position, result in enumerate(results):
        if not isinstance(result, dict) or result.get("kind", "song") != "song":
            continue
        artist, title = result.get("artistName"), result.get("trackName")
        if not isinstance(artist, str) or not isinstance(title, str) or not result.get("trackId"):
            continue
        if not overlaps(normalize_for_match(artist), want_artist):
            continue
        if normalize_for_match(title) != want_title or version_words(title) != want_version:
            continue
        preview = result.get("previewUrl")
        if not (isinstance(preview, str) and preview.startswith("http")):
            matched_without_preview = True
            continue
        seconds = (result.get("trackTimeMillis") or 0) / 1000.0
        gap = abs(seconds - (row["duration"] or seconds)) if seconds else 30.0
        if seconds and row["duration"] and gap > MAX_LENGTH_GAP_SECONDS:
            continue
        cleaned = result.get("trackExplicitness") == "cleaned"
        compilation = bool(COMPILATION.search(result.get("collectionName") or "")) or (
            (result.get("collectionArtistName") or "").lower() == "various artists"
        )
        # Canonical studio recording first: same length as the Deezer track, original album.
        accepted.append(((gap > 6, cleaned, compilation, round(gap), position), result))
    if not accepted:
        return None, matched_without_preview
    accepted.sort(key=lambda entry: entry[0])
    return accepted[0][1], True


def album_match(row, results: list[dict], same_release_only: bool = False) -> dict | None:
    """The track on the same release (found by UPC): same title and version, closest length.

    `same_release_only` is for answers that hold several albums: a track then also has to
    carry the song's artist or its album title."""
    want_title = normalize_for_match(row["title"])
    want_version = version_words(row["title"])
    want_artist = normalize_for_match(row["artist"])
    want_album = normalize_for_match(row["album"] or "")
    accepted = []
    for position, result in enumerate(results):
        if not isinstance(result, dict) or result.get("wrapperType") != "track" or not result.get("trackId"):
            continue
        title, preview = result.get("trackName"), result.get("previewUrl")
        if not isinstance(title, str) or not (isinstance(preview, str) and preview.startswith("http")):
            continue
        if version_words(title) != want_version:
            continue
        if same_release_only:
            artist_ok = overlaps(normalize_for_match(result.get("artistName") or ""), want_artist)
            album_ok = overlaps(normalize_for_match(result.get("collectionName") or ""), want_album)
            if not (artist_ok or album_ok):
                continue
        got_title = normalize_for_match(title)
        seconds = (result.get("trackTimeMillis") or 0) / 1000.0
        gap = abs(seconds - (row["duration"] or 0)) if seconds and row["duration"] else 99.0
        same = got_title == want_title
        # Stores spell titles differently ("2 Wicky" / "2Wicky", "Goin' Up" / "Going Up",
        # "Einaudi: Dietro Casa" / "Dietro casa"). On the same release, a similar title with
        # the same length to the second is the same track.
        if (same and gap <= MAX_LENGTH_GAP_SECONDS) or (gap <= 1.5 and similar_titles(want_title, got_title)):
            accepted.append(((not same, round(gap, 1), position), result))
    if not accepted:
        return None
    accepted.sort(key=lambda entry: entry[0])
    return accepted[0][1]


def similar_titles(a: str, b: str) -> bool:
    """Two normalised titles that are the same but for spelling, censoring or a prefix."""
    if not a or not b:
        return False
    if a.replace(" ", "") == b.replace(" ", ""):
        return True
    if min(len(a), len(b)) >= 4 and (a in b or b in a):
        return True
    words_a, words_b = set(a.split()), set(b.split())
    shared = len(words_a & words_b)
    return shared >= 2 and shared / min(len(words_a), len(words_b)) >= 0.6


def recheck_cached_albums(conn) -> int:
    """Re-read the album answers already in the cache for songs that still have no match.
    No network: useful after the matching rules change."""
    import zlib

    albums: dict[str, list] = {}
    for record in conn.execute("SELECT key, body FROM http_cache WHERE key LIKE 'itunes:upc%'"):
        results = json.loads(zlib.decompress(record["body"])).get("results") or []
        for upc in record["key"].split(":", 2)[2].split(","):
            albums.setdefault(upc, []).extend(results)
    rows = conn.execute(
        """SELECT * FROM tracks WHERE selected = 1 AND itunes_track_id IS NULL AND itunes_upc_tried > 0
           AND (drop_reason IS NULL OR drop_reason LIKE 'itunes:%')"""
    ).fetchall()
    found = 0
    for row in rows:
        upc = album_upc(conn, row)
        best = album_match(row, albums.get(upc or "", []), same_release_only=True)
        if best is not None:
            record_match(conn, row, best, 2)
            conn.execute("UPDATE tracks SET drop_reason = NULL WHERE deezer_id = ?", (row["deezer_id"],))
            found += 1
    conn.commit()
    return found


def drop_duplicate_matches(conn) -> int:
    """Two Deezer tracks that resolve to one iTunes track are one recording under two credits
    (Gary Jules / Michael Andrews, "Mad World"): keep the more popular one."""
    dropped = 0
    groups = conn.execute(
        """SELECT itunes_track_id FROM tracks WHERE selected = 1 AND drop_reason IS NULL
           AND itunes_track_id IS NOT NULL GROUP BY itunes_track_id HAVING COUNT(*) > 1"""
    ).fetchall()
    for group in groups:
        rows = conn.execute(
            "SELECT deezer_id FROM tracks WHERE selected = 1 AND drop_reason IS NULL AND itunes_track_id = ? "
            "ORDER BY labeled DESC, rank DESC",
            (group["itunes_track_id"],),
        ).fetchall()
        for row in rows[1:]:
            conn.execute(
                "UPDATE tracks SET drop_reason = 'itunes:duplicate recording' WHERE deezer_id = ?", (row["deezer_id"],)
            )
            dropped += 1
    conn.commit()
    return dropped


def album_upc(conn, row) -> str | None:
    """The album's UPC, from the Deezer album response enrich.py cached."""
    if not row["album_id"]:
        return None
    album = cache_get(conn, f"deezer:/album/{row['album_id']}?")
    upc = (album or {}).get("upc")
    return str(upc) if upc else None


# Labeled songs the library is short of go first: calm material, thin moods, morning songs.
SCARCE = (
    "(labels IS NOT NULL AND (json_extract(labels, '$.energy') < 0.4"
    " OR labels LIKE '%\"calm\"%' OR labels LIKE '%\"ethereal\"%' OR labels LIKE '%\"cozy\"%'"
    " OR labels LIKE '%\"tender\"%' OR labels LIKE '%\"dreamy\"%' OR labels LIKE '%\"morning\"%'))"
)


def next_row(conn):
    """The unchecked song most likely to survive and most needed: labeled songs first, scarce
    material before the rest, brand-new releases last, then by popularity."""
    return conn.execute(
        f"""SELECT * FROM tracks
            WHERE selected = 1 AND enriched = 1 AND drop_reason IS NULL AND itunes_checked = 0
            ORDER BY labeled DESC, {SCARCE} DESC,
                     (release_date IS NULL OR release_date < '2025-07-01') DESC, analyzed DESC, rank DESC
            LIMIT 1"""
    ).fetchone()


def next_miss(conn):
    """A song the search did not find and whose album has not been looked up yet."""
    return conn.execute(
        """SELECT * FROM tracks
           WHERE selected = 1 AND itunes_checked = 1 AND itunes_upc_tried != 1
             AND drop_reason IN ('itunes:no match', 'itunes:no preview')
           ORDER BY rank DESC LIMIT 1"""
    ).fetchone()


def record_match(conn, row, best: dict, how: int) -> None:
    release = best.get("releaseDate")
    year = int(release[:4]) if isinstance(release, str) and release[:4].isdigit() else None
    conn.execute(
        "UPDATE tracks SET itunes_checked = ?, itunes_track_id = ?, itunes_preview_url = ?, itunes_year = ? "
        "WHERE deezer_id = ?",
        (how, int(best["trackId"]), best["previewUrl"], year, row["deezer_id"]),
    )


def album_pass(conn, session, limiter: SharedRateLimiter, limit: int | None) -> tuple[int, int]:
    """Resolve unchecked songs through their album UPC, several albums per call.

    Returns (songs tried, songs matched). Songs it cannot resolve are left for the search."""
    tried = matched = 0
    while limit is None or tried < limit:
        rows = conn.execute(
            f"""SELECT * FROM tracks
                WHERE selected = 1 AND enriched = 1 AND drop_reason IS NULL AND itunes_checked = 0
                  AND itunes_upc_tried = 0
                ORDER BY labeled DESC, {SCARCE} DESC,
                         (release_date IS NULL OR release_date < '2025-07-01') DESC, analyzed DESC, rank DESC
                LIMIT ?""",
            (UPCS_PER_CALL * 2,),
        ).fetchall()
        if not rows:
            break
        batch: list[tuple] = []
        upcs: list[str] = []
        for row in rows:
            upc = album_upc(conn, row)
            if not upc or not upc.isdigit():
                conn.execute("UPDATE tracks SET itunes_upc_tried = 1 WHERE deezer_id = ?", (row["deezer_id"],))
                continue
            if upc not in upcs:
                if len(upcs) >= UPCS_PER_CALL:
                    continue
                upcs.append(upc)
            batch.append(row)
        conn.commit()
        if not batch:
            continue
        data = lookup_albums(session, limiter, conn, upcs)
        results = (data.get("results") if isinstance(data, dict) else None) or []
        cut_short = len(results) >= LOOKUP_LIMIT - 5
        for row in batch:
            best = album_match(row, results, same_release_only=True)
            tried += 1
            if best is not None:
                record_match(conn, row, best, 2)
                conn.execute("UPDATE tracks SET itunes_upc_tried = 1 WHERE deezer_id = ?", (row["deezer_id"],))
                matched += 1
            else:
                conn.execute(
                    "UPDATE tracks SET itunes_upc_tried = ? WHERE deezer_id = ?",
                    (2 if cut_short else 1, row["deezer_id"]),
                )
        conn.commit()
        if tried % 80 < len(batch):
            log(f"album lookup: {tried} songs tried, {matched} matched")
    return tried, matched


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--limit", type=int, default=None, help="check at most N songs this run")
    parser.add_argument("--recheck-cache", action="store_true",
                        help="only re-read cached album answers for unmatched songs (no network)")
    args = parser.parse_args()

    import requests

    conn = connect()
    session = requests.Session()
    session.headers["User-Agent"] = USER_AGENT
    limiter = SharedRateLimiter("itunes", CALLS_PER_MINUTE / 60.0)
    matched = dropped = checked = 0

    if args.recheck_cache:
        log(f"cached album answers: {recheck_cached_albums(conn)} more songs matched")
        log(f"duplicate recordings dropped: {drop_duplicate_matches(conn)}")
        return

    tried, by_album = album_pass(conn, session, limiter, args.limit)
    log(f"album lookup: {tried} songs tried, {by_album} matched; the rest go to the search")

    recovered = 0
    while args.limit is None or checked < args.limit:
        # Misses first: there are few, and they are often very well-known songs.
        row = next_miss(conn)
        second_try = row is not None
        if row is None:
            row = next_row(conn)
        if row is None:
            waiting = conn.execute(
                "SELECT COUNT(*) FROM tracks WHERE selected = 1 AND enriched = 0 AND drop_reason IS NULL"
            ).fetchone()[0]
            if waiting:  # enrich.py is still running: wait for more songs
                time.sleep(20)
                continue
            break

        best = None
        if second_try:
            upc = album_upc(conn, row)
            if upc:
                data = lookup_album(session, limiter, conn, upc)
                best = album_match(row, (data.get("results") if isinstance(data, dict) else None) or [])
            if best is None:
                conn.execute("UPDATE tracks SET itunes_checked = 2 WHERE deezer_id = ?", (row["deezer_id"],))
                conn.commit()
                continue
            conn.execute("UPDATE tracks SET drop_reason = NULL WHERE deezer_id = ?", (row["deezer_id"],))
            dropped -= 1
            recovered += 1
        else:
            if version_words(row["title"]):
                term = search_words(f"{row['artist']} {row['title']}")
            else:
                term = f"{normalize_for_match(row['artist'])} {normalize_for_match(row['title'])}"
            data = search(session, limiter, conn, term)
            best, any_match = best_match(row, (data.get("results") if isinstance(data, dict) else None) or [])
            checked += 1
            if best is None:
                reason = "itunes:no preview" if any_match else "itunes:no match"
                conn.execute(
                    "UPDATE tracks SET itunes_checked = 1, drop_reason = COALESCE(drop_reason, ?) WHERE deezer_id = ?",
                    (reason, row["deezer_id"]),
                )
                conn.commit()
                dropped += 1
                continue

        record_match(conn, row, best, 2 if second_try else 1)
        conn.commit()
        matched += 1
        if (checked + recovered) % 50 == 0:
            log(f"searched {checked}: matched {matched} ({recovered} through the album UPC), unmatched {dropped}")

    log(f"searched {checked}: matched {matched} ({recovered} through the album UPC), unmatched {dropped}")
    log(f"duplicate recordings dropped: {drop_duplicate_matches(conn)}")
    left = conn.execute(
        "SELECT COUNT(*) FROM tracks WHERE selected = 1 AND drop_reason IS NULL AND itunes_checked = 0"
    ).fetchone()[0]
    log(f"{left} songs still to check")


if __name__ == "__main__":
    main()
