"""Dominant cover colour for every library song.

The app tints its graphics with each song's "album ink", derived on the phone
from the raw colour stored here (05-visual-identity.md). This script downloads a
small copy of each cover, picks the colour, and stores the raw hex in
tracks.cover_color. push.py exports it as `coverColor`.

  .venv/bin/python cover_color.py              # every library song without a colour yet
  .venv/bin/python cover_color.py --redo       # recompute all (covers come from the cache)
  .venv/bin/python cover_color.py --test       # show the rule on a few varied covers
  .venv/bin/python cover_color.py --dump out/cover_colors.json   # deezerId -> hex, for patching Convex

The rule:
  1. Shrink to 64x64 and cut 8% off every edge, so a thin border cannot win.
  2. Quantise to 8 colours.
  3. Drop buckets that are near white, near black or near grey, and buckets
     smaller than 6% of the picture.
  4. Of the three largest that remain, take the most colourful (largest chroma,
     which unlike HSL saturation does not flatter near-black). Skin-tone hues
     count for 0.6 of their chroma, so a face loses to a real colour of
     comparable area but still wins when it is all there is.
  5. Nothing left: no colour. The app falls back to a neutral ink.

Covers are cached in cache/covers/, so reruns do not refetch.
"""

from __future__ import annotations

import argparse
import colorsys
import json
import re
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests
from PIL import Image

from common import CACHE_DIR, connect, log

COVER_DIR = CACHE_DIR / "covers"
SIZE = "120x120"
WORKERS = 6
USER_AGENT = "Score/1.0 hackathon prototype"

SHRINK = 64
CROP = 0.08
PALETTE = 8
MIN_AREA = 0.06
MIN_SATURATION = 0.18
MIN_CHROMA = 0.08
MAX_LIGHTNESS = 0.90
MIN_LIGHTNESS = 0.07
# Skin tones: orange-brown hues of middling saturation. They count for less when ranking.
SKIN_HUE = (10 / 360, 40 / 360)
SKIN_WEIGHT = 0.6
TOP_BY_AREA = 3


def small_url(cover_url: str) -> str:
    """The Deezer CDN takes the size as a path segment: .../1000x1000-000000-80-0-0.jpg."""
    return re.sub(r"/\d+x\d+-", f"/{SIZE}-", cover_url)


def cover_path(cover_url: str) -> Path:
    digest = re.search(r"/cover/([0-9a-f]+)/", cover_url)
    name = digest.group(1) if digest else re.sub(r"\W+", "_", cover_url)[-80:]
    return COVER_DIR / f"{name}.jpg"


def download(cover_url: str) -> Path | None:
    path = cover_path(cover_url)
    if path.exists() and path.stat().st_size > 0:
        return path
    for attempt in range(3):
        try:
            response = requests.get(small_url(cover_url), timeout=15, headers={"User-Agent": USER_AGENT})
            if response.status_code == 200 and response.content:
                path.write_bytes(response.content)
                return path
            if response.status_code == 404:
                return None
        except requests.RequestException:
            pass
        time.sleep(1.5 * (attempt + 1))
    return None


def buckets(path: Path) -> list[dict]:
    """The picture as up to 8 colour buckets, largest first."""
    image = Image.open(path).convert("RGB").resize((SHRINK, SHRINK), Image.LANCZOS)
    edge = round(SHRINK * CROP)
    image = image.crop((edge, edge, SHRINK - edge, SHRINK - edge))
    quantised = image.quantize(colors=PALETTE, method=Image.Quantize.MEDIANCUT)
    palette = quantised.getpalette()
    total = image.width * image.height
    found = []
    for count, index in quantised.getcolors():
        r, g, b = palette[index * 3 : index * 3 + 3]
        hue, lightness, saturation = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
        found.append(
            {
                "hex": f"#{r:02X}{g:02X}{b:02X}",
                "area": count / total,
                "saturation": saturation,
                "lightness": lightness,
                "hue": hue,
                "chroma": (max(r, g, b) - min(r, g, b)) / 255,
            }
        )
    return sorted(found, key=lambda bucket: -bucket["area"])


def is_coloured(bucket: dict) -> bool:
    return (
        bucket["area"] >= MIN_AREA
        and bucket["saturation"] >= MIN_SATURATION
        and bucket["chroma"] >= MIN_CHROMA
        and MIN_LIGHTNESS <= bucket["lightness"] <= MAX_LIGHTNESS
    )


def vividness(bucket: dict) -> float:
    skin = (
        SKIN_HUE[0] <= bucket["hue"] <= SKIN_HUE[1]
        and 0.25 <= bucket["lightness"] <= 0.80
        and bucket["saturation"] <= 0.65
    )
    return bucket["chroma"] * (SKIN_WEIGHT if skin else 1.0)


def dominant(path: Path) -> str | None:
    coloured = [bucket for bucket in buckets(path) if is_coloured(bucket)]
    if not coloured:
        return None
    return max(coloured[:TOP_BY_AREA], key=vividness)["hex"]


def colour_for(cover_url: str) -> tuple[str, str | None]:
    """("ok" | "no_cover" | "neutral", hex or None)"""
    path = download(cover_url)
    if path is None:
        return "no_cover", None
    try:
        colour = dominant(path)
    except OSError:
        return "no_cover", None
    return ("ok", colour) if colour else ("neutral", None)


def ensure_column(conn) -> None:
    columns = {row["name"] for row in conn.execute("PRAGMA table_info(tracks)")}
    if "cover_color" not in columns:
        conn.execute("ALTER TABLE tracks ADD COLUMN cover_color TEXT")
    if "cover_color_checked" not in columns:
        conn.execute("ALTER TABLE tracks ADD COLUMN cover_color_checked INTEGER NOT NULL DEFAULT 0")
    conn.commit()


def library(conn):
    from push import library_records  # late: push imports the embedding stack

    return library_records(conn)


def run(redo: bool) -> None:
    conn = connect()
    ensure_column(conn)
    COVER_DIR.mkdir(parents=True, exist_ok=True)
    todo = [row for row in library(conn) if row["cover_url"] and (redo or not row["cover_color_checked"])]
    log(f"{len(todo)} covers to look at")
    counts = {"ok": 0, "neutral": 0, "no_cover": 0}
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        results = pool.map(lambda row: (row["deezer_id"], *colour_for(row["cover_url"])), todo)
        for done, (deezer_id, status, colour) in enumerate(results, 1):
            counts[status] += 1
            # A cover that failed to download is left unchecked, so a rerun tries it again.
            conn.execute(
                "UPDATE tracks SET cover_color = ?, cover_color_checked = ? WHERE deezer_id = ?",
                (colour, 0 if status == "no_cover" else 1, deezer_id),
            )
            if done % 200 == 0:
                conn.commit()
                log(f"  {done}/{len(todo)}")
    conn.commit()
    with_colour = sum(1 for row in library(conn) if row["cover_color"])
    log(f"done: {counts}; library songs with a colour: {with_colour}")


def dump(path: Path) -> None:
    conn = connect()
    ensure_column(conn)
    rows = {str(row["deezer_id"]): row["cover_color"] for row in library(conn) if row["cover_color"]}
    path.write_text(json.dumps(rows))
    log(f"wrote {len(rows)} colours to {path}")


def test(titles: list[str]) -> None:
    conn = connect()
    COVER_DIR.mkdir(parents=True, exist_ok=True)
    for wanted in titles:
        row = conn.execute(
            "SELECT * FROM tracks WHERE cover_url IS NOT NULL AND (title || ' ' || artist || ' ' || COALESCE(album, '')) LIKE ? "
            "ORDER BY deezer_id LIMIT 1",
            (f"%{wanted}%",),
        ).fetchone()
        if row is None:
            print(f"\n{wanted}: not in work.db")
            continue
        path = download(row["cover_url"])
        print(f"\n{row['title']} - {row['artist']} ({row['album']})  ->  {dominant(path) if path else 'no cover'}")
        print(f"  {small_url(row['cover_url'])}")
        for bucket in buckets(path) if path else []:
            mark = "colour " if is_coloured(bucket) else "neutral"
            print(
                f"  {bucket['hex']}  area {bucket['area']:.2f}  sat {bucket['saturation']:.2f}  chroma {bucket['chroma']:.2f}  "
                f"light {bucket['lightness']:.2f}  {mark}"
            )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--redo", action="store_true", help="recompute songs that already have a result")
    parser.add_argument("--test", nargs="*", metavar="TEXT", help="show the buckets for covers matching these texts")
    parser.add_argument("--dump", type=Path, help="write deezerId -> hex as JSON")
    args = parser.parse_args()
    if args.test is not None:
        test(args.test)
    elif args.dump:
        dump(args.dump)
    else:
        run(args.redo)


if __name__ == "__main__":
    main()
