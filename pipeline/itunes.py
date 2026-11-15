"""Step 2b: find each song in the iTunes Store, where the app's previews come from at runtime.

Deezer refuses requests from Convex's servers, so the backend plays iTunes previews. For each song
this searches https://itunes.apple.com/search?term=<artist title>&entity=song and accepts a
result only when the artist matches, the base title matches and the version words (remix, live,
acoustic, demo...) are the same: the rules of convex/lib/preview.ts. Among accepted results the
canonical studio recording is preferred (closest duration to the Deezer track, not a clean edit,
not a compilation). Songs with no match that has a preview are dropped: they cannot play.

The store's search sometimes hides the original behind covers (Radiohead's "Creep", "Killing In
The Name"). A song the search misses gets a second, exact attempt: the album is looked up by the
UPC Deezer lists for it (https://itunes.apple.com/lookup?upc=...&entity=song) and the track is
picked from that release by title and length.

Apple allows roughly 20 calls a minute per IP, so this is slow (about 3 seconds per song). Songs
most likely to survive go first: labeled, then analysed, then by popularity.

    python itunes.py [--limit N]

Resumable: every response is cached in work.db and checked songs are skipped.
"""
from __future__ import annotations

import argparse
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


def album_match(row, results: list[dict]) -> dict | None:
    """The track on the same release (found by UPC): same title and version, closest length."""
    want_title = normalize_for_match(row["title"])
    want_version = version_words(row["title"])
    accepted = []
    for position, result in enumerate(results):
        if not isinstance(result, dict) or result.get("wrapperType") != "track" or not result.get("trackId"):
            continue
        title, preview = result.get("trackName"), result.get("previewUrl")
        if not isinstance(title, str) or not (isinstance(preview, str) and preview.startswith("http")):
            continue
        if version_words(title) != want_version:
            continue
        got_title = normalize_for_match(title)
        seconds = (result.get("trackTimeMillis") or 0) / 1000.0
        gap = abs(seconds - (row["duration"] or 0)) if seconds and row["duration"] else 99.0
        same = got_title == want_title
        # Classical titles are written differently per store: accept one inside the other
        # when the length agrees to the second.
        inside = len(want_title) >= 6 and len(got_title) >= 6 and (want_title in got_title or got_title in want_title)
        if (same and gap <= 8) or (inside and gap <= 2.5):
            accepted.append(((not same, round(gap, 1), position), result))
    if not accepted:
        return None
    accepted.sort(key=lambda entry: entry[0])
    return accepted[0][1]


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
    """A song the search did not find: it gets one exact attempt through its album's UPC."""
    return conn.execute(
        """SELECT * FROM tracks
           WHERE selected = 1 AND itunes_checked = 1 AND drop_reason IN ('itunes:no match', 'itunes:no preview')
           ORDER BY rank DESC LIMIT 1"""
    ).fetchone()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--limit", type=int, default=None, help="check at most N songs this run")
    args = parser.parse_args()

    import requests

    conn = connect()
    session = requests.Session()
    session.headers["User-Agent"] = USER_AGENT
    limiter = SharedRateLimiter("itunes", CALLS_PER_MINUTE / 60.0)
    matched = dropped = checked = 0

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

        release = best.get("releaseDate")
        year = int(release[:4]) if isinstance(release, str) and release[:4].isdigit() else None
        conn.execute(
            "UPDATE tracks SET itunes_checked = ?, itunes_track_id = ?, itunes_preview_url = ?, itunes_year = ? "
            "WHERE deezer_id = ?",
            (2 if second_try else 1, int(best["trackId"]), best["previewUrl"], year, row["deezer_id"]),
        )
        conn.commit()
        matched += 1
        if (checked + recovered) % 50 == 0:
            log(f"searched {checked}: matched {matched} ({recovered} through the album UPC), unmatched {dropped}")

    log(f"searched {checked}: matched {matched} ({recovered} through the album UPC), unmatched {dropped}")
    left = conn.execute(
        "SELECT COUNT(*) FROM tracks WHERE selected = 1 AND drop_reason IS NULL AND itunes_checked = 0"
    ).fetchone()[0]
    log(f"{left} songs still to check")


if __name__ == "__main__":
    main()
