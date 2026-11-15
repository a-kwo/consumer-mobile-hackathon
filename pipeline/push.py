"""Step 6: export the library as JSONL files that match convex/schema.ts exactly.

Writes pipeline/out/scenes.jsonl and pipeline/out/songs.jsonl, validates every row against the
`scenes` and `songs` table shapes (exact field names and types, no extra fields, optional fields
omitted rather than null, no _id or _creationTime), and prints the import commands. It does not
run them.

Only songs with an iTunes match that has a preview are exported: the app plays iTunes previews,
so a song without one cannot play. Mood order is kept as labeled (most defining first).

    python push.py                 # both files (songs only if any are labeled and embedded)
    python push.py --scenes-only
    python push.py --limit 50      # export at most N songs
"""
from __future__ import annotations

import argparse
import itertools
import json
import math

from common import OUT_DIR, TIME_IDS, connect, die, load_vocab, log
from embed import DIMENSIONS, from_blob, scene_key

SONG_REQUIRED = {
    "deezerId": "int", "title": "str", "artist": "str", "coverUrl": "str", "bpm": "num",
    "energy": "unit", "valence": "unit", "tension": "unit", "social": "unit", "vocal": "unit",
    "confidence": "unit", "moods": "list", "scenes": "list", "timeOfDay": "list", "embedding": "vector",
}
SONG_OPTIONAL = {"isrc": "str", "album": "str", "itunesTrackId": "int"}
SCENE_REQUIRED = {"key": "str", "text": "str", "embedding": "vector"}


def is_number(value) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def check_vector(value, dimensions: int) -> str | None:
    if not isinstance(value, list) or len(value) != dimensions:
        return f"embedding must have {dimensions} numbers"
    if not all(is_number(item) for item in value):
        return "embedding has a non-number"
    norm = math.sqrt(sum(item * item for item in value))
    if abs(norm - 1.0) > 1e-4:
        return f"embedding norm is {norm:.6f}, not 1"
    return None


def check_fields(row: dict, required: dict, optional: dict, dimensions: int) -> str | None:
    extra = set(row) - set(required) - set(optional)
    if extra:
        return f"unexpected fields {sorted(extra)}"
    for name, kind in {**required, **optional}.items():
        if name not in row:
            if name in required:
                return f"missing {name}"
            continue
        value = row[name]
        if value is None:
            return f"{name} is null"
        if kind == "int" and not (isinstance(value, int) and not isinstance(value, bool) and value > 0):
            return f"{name} must be a positive integer"
        if kind == "str" and not (isinstance(value, str) and value.strip()):
            return f"{name} must be a non-empty string"
        if kind == "num" and not is_number(value):
            return f"{name} must be a number"
        if kind == "unit" and not (is_number(value) and 0.0 <= value <= 1.0):
            return f"{name} must be a number from 0 to 1"
        if kind == "list" and not (isinstance(value, list) and value and all(isinstance(item, str) for item in value)):
            return f"{name} must be a non-empty list of strings"
        if kind == "vector":
            problem = check_vector(value, dimensions)
            if problem:
                return problem
    return None


def validate_song(row: dict, vocab: dict) -> str | None:
    problem = check_fields(row, SONG_REQUIRED, SONG_OPTIONAL, vocab["embedding"]["dimensions"])
    if problem:
        return problem
    if not 40 <= row["bpm"] <= 220:
        return f"bpm {row['bpm']} out of range"
    if not row["coverUrl"].startswith("https://"):
        return "coverUrl is not https"
    for name, allowed, most in (("moods", vocab["moods"], 4), ("scenes", vocab["sceneTags"], 4), ("timeOfDay", TIME_IDS, 4)):
        values = row[name]
        if len(values) > most or len(set(values)) != len(values) or any(item not in allowed for item in values):
            return f"{name} has values outside the vocabulary: {values}"
    return None


def validate_scene(row: dict, vocab: dict, expected_keys: set[str]) -> str | None:
    problem = check_fields(row, SCENE_REQUIRED, {}, vocab["embedding"]["dimensions"])
    if problem:
        return problem
    if row["key"] not in expected_keys:
        return f"unknown scene key {row['key']}"
    return None


def rounded(blob: bytes) -> list[float]:
    return [round(float(value), 6) for value in from_blob(blob)]


def write_jsonl(path, rows: list[dict]) -> None:
    with open(path, "w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, allow_nan=False) + "\n")


def read_back(path, validate) -> int:
    """Re-read the file as the importer will, and validate every line."""
    count = 0
    with open(path, encoding="utf-8") as handle:
        for number, line in enumerate(handle, 1):
            problem = validate(json.loads(line))
            if problem:
                die(f"{path.name} line {number}: {problem}")
            count += 1
    return count


def export_scenes(conn, vocab: dict) -> int:
    expected = {
        scene_key(*(part["id"] for part in parts))
        for parts in itertools.product(*(vocab[name] for name in DIMENSIONS))
    }
    rows = [
        {"key": row["key"], "text": row["text"], "embedding": rounded(row["embedding"])}
        for row in conn.execute("SELECT key, text, embedding FROM scenes ORDER BY key")
    ]
    if {row["key"] for row in rows} != expected:
        die(f"scenes table has {len(rows)} keys, expected {len(expected)}: run embed.py first")
    path = OUT_DIR / "scenes.jsonl"
    write_jsonl(path, rows)
    count = read_back(path, lambda row: validate_scene(row, vocab, expected))
    log(f"{path} : {count} rows, {path.stat().st_size / 1e6:.2f} MB, every row valid")
    return count


READY = (
    "labeled = 1 AND drop_reason IS NULL AND labels IS NOT NULL AND embedding IS NOT NULL "
    "AND bpm IS NOT NULL AND confidence >= ?"
)


def library_records(conn, min_confidence: float = 0.6):
    """The songs that make up the library: labeled, embedded, and playable through iTunes."""
    return conn.execute(
        f"SELECT * FROM tracks WHERE {READY} AND itunes_track_id IS NOT NULL ORDER BY deezer_id", (min_confidence,)
    ).fetchall()


def export_songs(conn, vocab: dict, limit: int | None, min_confidence: float) -> int:
    waiting = conn.execute(
        f"SELECT COUNT(*) FROM tracks WHERE {READY} AND itunes_checked = 0", (min_confidence,)
    ).fetchone()[0]
    if waiting:
        log(f"{waiting} labeled songs are not exported yet: their iTunes check has not run (itunes.py)")
    records = library_records(conn, min_confidence)
    if limit is not None:
        records = records[:limit]
    rows = []
    for record in records:
        labels = json.loads(record["labels"])
        row = {
            "deezerId": int(record["deezer_id"]),
            "title": record["title"],
            "artist": record["artist"],
            "coverUrl": record["cover_url"],
            "bpm": float(record["bpm"]),
            "energy": float(labels["energy"]),
            "valence": float(labels["valence"]),
            "tension": float(labels["tension"]),
            "moods": list(labels["moods"]),
            "scenes": list(labels["scenes"]),
            "timeOfDay": list(labels["timeOfDay"]),
            "social": float(labels["social"]),
            "vocal": float(labels["vocal"]),
            "confidence": float(record["confidence"]),
            "embedding": rounded(record["embedding"]),
        }
        # Optional fields are omitted, never null.
        if record["isrc"]:
            row["isrc"] = record["isrc"]
        if record["album"]:
            row["album"] = record["album"]
        if record["itunes_track_id"]:
            row["itunesTrackId"] = int(record["itunes_track_id"])
        rows.append(row)
    if not rows:
        log("no labeled and embedded songs yet: songs.jsonl not written")
        return 0
    ids = [row["deezerId"] for row in rows]
    if len(set(ids)) != len(ids):
        die("duplicate deezerId in export")
    path = OUT_DIR / "songs.jsonl"
    write_jsonl(path, rows)
    count = read_back(path, lambda row: validate_song(row, vocab))
    log(f"{path} : {count} rows, {path.stat().st_size / 1e6:.2f} MB, every row valid")
    return count


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--scenes-only", action="store_true")
    parser.add_argument("--songs-only", action="store_true")
    parser.add_argument("--limit", type=int, default=None, help="export at most N songs")
    parser.add_argument("--min-confidence", type=float, default=0.6)
    args = parser.parse_args()

    vocab = load_vocab()
    conn = connect()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    scenes = songs = 0
    if not args.songs_only:
        scenes = export_scenes(conn, vocab)
    if not args.scenes_only:
        songs = export_songs(conn, vocab, args.limit, args.min_confidence)

    print("\nImport from the repository root (this script does not run these):")
    if scenes:
        print("  npx convex import --table scenes --replace -y pipeline/out/scenes.jsonl")
    if songs:
        print("  npx convex import --table songs --replace -y pipeline/out/songs.jsonl")


if __name__ == "__main__":
    main()
