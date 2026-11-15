"""Step 2: look up every selected candidate on Deezer and keep what the app needs.

Stores deezerId, ISRC, clean title, artist, album, cover URL, Deezer BPM, duration, rank, release
date, genre and whether a preview exists. Drops tracks with no preview, no cover or
`readable: false`. Preview URLs are never stored: they are signed and expire.

    python enrich.py [--limit N] [--no-genre]

Resumable: tracks already enriched are skipped, and responses are cached in work.db.
"""
from __future__ import annotations

import argparse
import re

from common import Deezer, DeezerError, connect, log

_NOISE_WORDS = (
    r"remaster(?:ed)?|re-?master(?:ed)?|radio edit|single edit|album edit|edit|single version|album version|"
    r"original version|version|mono|stereo|bonus track|deluxe|explicit|clean|original mix|"
    r"from (?:the |\")|soundtrack|anniversary|edition|digital master|original motion picture"
)
_NOISE_BRACKET = re.compile(rf"\s*[\(\[][^\)\]]*\b(?:{_NOISE_WORDS})[^\)\]]*[\)\]]", re.IGNORECASE)
_NOISE_DASH = re.compile(rf"\s[-–—]\s[^-–—]*\b(?:{_NOISE_WORDS}|19\d\d|20\d\d)\b[^-–—]*$", re.IGNORECASE)


def clean_title(title: str, title_short: str | None) -> str:
    """Display title without remaster / edit / soundtrack noise."""
    base = (title_short or title or "").strip()
    cleaned = _NOISE_BRACKET.sub("", base)
    cleaned = _NOISE_DASH.sub("", cleaned).strip(" -–—")
    return cleaned or base or title


def cover_from(album: dict, track: dict) -> str | None:
    for field in ("cover_xl", "cover_big", "cover_medium"):
        if album.get(field):
            return album[field]
    digest = album.get("md5_image") or track.get("md5_image")
    if digest:
        return f"https://cdn-images.dzcdn.net/images/cover/{digest}/1000x1000-000000-80-0-0.jpg"
    return None


def enrich_one(api: Deezer, conn, row, with_genre: bool) -> str | None:
    """Returns a drop reason, or None when the track was enriched."""
    track = api.get(f"/track/{row['deezer_id']}")
    if not track:
        return "enrich:not found"
    if track.get("readable") is False:
        return "enrich:not readable"
    has_preview = bool(track.get("preview")) or bool(track.get("has_preview"))
    if not has_preview:
        return "enrich:no preview"
    album = track.get("album") or {}
    cover = cover_from(album, track)
    if not cover:
        return "enrich:no cover"

    genre = None
    release = track.get("release_date") or album.get("release_date")
    if with_genre and album.get("id"):
        try:
            detail = api.get(f"/album/{album['id']}") or {}
        except DeezerError:
            detail = {}
        genres = ((detail.get("genres") or {}).get("data")) or []
        if genres:
            genre = genres[0].get("name")
        release = release or detail.get("release_date")

    bpm = track.get("bpm") or 0
    conn.execute(
        """UPDATE tracks SET enriched = 1, title = ?, artist = ?, album = ?, album_id = ?, isrc = ?,
                             cover_url = ?, deezer_bpm = ?, gain = ?, release_date = ?, genre = ?,
                             duration = ?, rank = ?, has_preview = 1
           WHERE deezer_id = ?""",
        (
            clean_title(track.get("title") or row["title"], track.get("title_short")),
            (track.get("artist") or {}).get("name") or row["artist"],
            album.get("title") or row["album"],
            album.get("id") or row["album_id"],
            track.get("isrc") or None,
            cover,
            float(bpm) if bpm and bpm > 0 else None,
            track.get("gain"),
            release if release and release != "0000-00-00" else None,
            genre,
            track.get("duration") or row["duration"],
            track.get("rank") or row["rank"],
            row["deezer_id"],
        ),
    )
    return None


def drop_isrc_duplicates(conn) -> int:
    """Two Deezer ids with one ISRC are the same recording: keep the more popular one."""
    dropped = 0
    groups = conn.execute(
        """SELECT isrc FROM tracks WHERE selected = 1 AND drop_reason IS NULL AND isrc IS NOT NULL
           GROUP BY isrc HAVING COUNT(*) > 1"""
    ).fetchall()
    for group in groups:
        rows = conn.execute(
            "SELECT deezer_id FROM tracks WHERE selected = 1 AND drop_reason IS NULL AND isrc = ? "
            "ORDER BY labeled DESC, analyzed DESC, rank DESC",
            (group["isrc"],),
        ).fetchall()
        for row in rows[1:]:
            conn.execute("UPDATE tracks SET drop_reason = 'enrich:duplicate isrc' WHERE deezer_id = ?", (row["deezer_id"],))
            dropped += 1
    conn.commit()
    return dropped


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--limit", type=int, default=None, help="enrich at most N tracks this run")
    parser.add_argument("--no-genre", action="store_true", help="skip the album lookup that provides the genre")
    args = parser.parse_args()

    conn = connect()
    api = Deezer(conn)
    rows = conn.execute(
        "SELECT * FROM tracks WHERE selected = 1 AND enriched = 0 AND drop_reason IS NULL ORDER BY rank DESC"
    ).fetchall()
    if args.limit is not None:
        rows = rows[: args.limit]
    log(f"{len(rows)} tracks to enrich")

    done = dropped = 0
    for index, row in enumerate(rows, 1):
        try:
            reason = enrich_one(api, conn, row, not args.no_genre)
        except DeezerError as error:
            log(f"skip {row['deezer_id']} for now: {error}")
            continue
        if reason:
            conn.execute("UPDATE tracks SET drop_reason = ? WHERE deezer_id = ?", (reason, row["deezer_id"]))
            dropped += 1
        else:
            done += 1
        conn.commit()
        if index % 100 == 0:
            log(f"{index}/{len(rows)} enriched {done}, dropped {dropped}")

    duplicates = drop_isrc_duplicates(conn)
    with_bpm = conn.execute(
        "SELECT COUNT(*) FROM tracks WHERE enriched = 1 AND drop_reason IS NULL AND deezer_bpm IS NOT NULL"
    ).fetchone()[0]
    total = conn.execute("SELECT COUNT(*) FROM tracks WHERE enriched = 1 AND drop_reason IS NULL").fetchone()[0]
    log(f"enriched {done}, dropped {dropped}, isrc duplicates {duplicates}")
    log(f"library so far: {total} enriched tracks, {with_bpm} with a Deezer BPM")
    log(f"deezer calls {api.calls}, cache hits {api.cache_hits}")


if __name__ == "__main__":
    main()
