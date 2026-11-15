"""Library health report: counts at every step, tempo agreement, histograms, coverage per mood
and scene tag, songs per decade, and the best-matching songs for a few scene keys.

    python report.py
    python report.py --scene "run|rain|night|city" --scene "still|snow|evening|indoors"
"""
from __future__ import annotations

import argparse
import json
from collections import Counter

import numpy as np

from analyze import report as tempo_report
from common import connect, load_vocab
from embed import from_blob
from push import library_records

DEFAULT_SCENES = ["run|clear|morning|nature", "still|rain|night|indoors", "walk|cloudy|afternoon|city"]


def bar(count: int, most: int, width: int = 40) -> str:
    return "#" * (round(width * count / most) if most else 0)


def histogram(title: str, buckets: list[tuple[str, int]]) -> None:
    print(f"\n{title}")
    most = max((count for _, count in buckets), default=0)
    for label, count in buckets:
        print(f"  {label:>9} {count:5d} {bar(count, most)}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--scene", action="append", default=[], help="scene key to list the top songs for")
    parser.add_argument("--top", type=int, default=8)
    parser.add_argument("--include-unchecked", action="store_true",
                        help="also count labeled songs whose iTunes check has not run yet")
    args = parser.parse_args()

    vocab = load_vocab()
    conn = connect()

    def count(where: str) -> int:
        return conn.execute(f"SELECT COUNT(*) FROM tracks WHERE {where}").fetchone()[0]

    print("== Pipeline")
    print(f"  playlist and chart tracks seen   {count('1=1')}")
    print(f"  selected as candidates           {count('selected = 1')}")
    print(f"  enriched                         {count('enriched = 1')}")
    print(f"  analysed (tempo measured)        {count('analyzed = 1 AND tempo IS NOT NULL')}")
    print(f"  labeled by the model             {count('labeled = 1')}")
    print(f"  kept after labeling              {count('labeled = 1 AND drop_reason IS NULL')}")
    print(f"  iTunes checked / matched         {count('itunes_checked > 0')} / {count('itunes_track_id IS NOT NULL')}")
    drops = conn.execute(
        "SELECT drop_reason, COUNT(*) AS n FROM tracks WHERE selected = 1 AND drop_reason IS NOT NULL "
        "GROUP BY drop_reason ORDER BY n DESC"
    ).fetchall()
    print("  dropped candidates: " + (", ".join(f"{row['drop_reason']} {row['n']}" for row in drops) or "none"))
    meta = {row["key"]: row["value"] for row in conn.execute("SELECT key, value FROM meta")}
    if meta.get("label_requests"):
        print(f"  labeling: {meta.get('label_provider')}, {meta['label_requests']} requests, "
              f"{meta.get('label_input_tokens')} tokens in, {meta.get('label_output_tokens')} out")
    print()
    tempo_report(conn)

    records = library_records(conn, include_unchecked=args.include_unchecked)
    note = "; includes songs still waiting for their iTunes check" if args.include_unchecked else ""
    print(f"\n== Library: {len(records)} songs (labeled, confident, embedded, playable through iTunes{note})")
    if not records:
        return
    labels = [json.loads(record["labels"]) for record in records]
    sources = Counter(record["bpm_source"] for record in records)
    print("  bpm source: " + ", ".join(f"{name} {n}" for name, n in sources.items()))
    print(f"  artists: {len({record['artist'] for record in records})}")

    bpm = Counter(int(record["bpm"] // 10) * 10 for record in records)
    histogram("BPM (10-BPM buckets)", [(f"{low}-{low + 9}", bpm[low]) for low in range(min(bpm), max(bpm) + 10, 10)])
    for field in ("energy", "valence"):
        values = Counter(min(9, int(label[field] * 10)) for label in labels)
        histogram(f"{field} (0.1 buckets)", [(f"{i / 10:.1f}-{(i + 1) / 10:.1f}", values[i]) for i in range(10)])

    for title, field, terms in (("Songs per mood", "moods", vocab["moods"]),
                                ("Songs per scene tag", "scenes", vocab["sceneTags"]),
                                ("Songs per time of day", "timeOfDay", ["morning", "afternoon", "evening", "night"])):
        counts = Counter(term for label in labels for term in label[field])
        ordered = sorted(terms, key=lambda term: -counts[term])
        print(f"\n{title}: " + ", ".join(f"{term} {counts[term]}" for term in ordered))
        thin = [term for term in terms if counts[term] < 20]
        if thin:
            print(f"  under 20 songs: {', '.join(thin)}")

    decades: Counter = Counter()
    for record, label in zip(records, labels):
        year = label.get("releaseYear") or record["itunes_year"] or (int(record["release_date"][:4]) if record["release_date"] else None)
        decades[f"{year // 10 * 10}s" if year else "unknown"] += 1
    histogram("Songs per decade (first release)", sorted(decades.items()))

    genres = Counter(record["genre"] or "unknown" for record in records)
    print("\nGenres (Deezer album genre): " + ", ".join(f"{name} {n}" for name, n in genres.most_common(16)))

    vectors = np.stack([from_blob(record["embedding"]) for record in records])
    print(f"\n== Top {args.top} songs by cosine similarity to a scene embedding")
    for key in args.scene or DEFAULT_SCENES:
        scene = conn.execute("SELECT text, embedding FROM scenes WHERE key = ?", (key,)).fetchone()
        if scene is None:
            print(f"\n{key}: no such scene (run embed.py)")
            continue
        scores = vectors @ from_blob(scene["embedding"])
        print(f"\n{key}\n  scene text: {scene['text']}")
        print(f"  cosine over the library: min {scores.min():.2f}, median {np.median(scores):.2f}, max {scores.max():.2f}")
        for index in np.argsort(-scores)[: args.top]:
            record, label = records[index], labels[index]
            print(f"  {scores[index]:.3f}  {record['artist']} - {record['title']}  "
                  f"[{round(record['bpm'])} bpm, energy {label['energy']:.2f}, valence {label['valence']:.2f}; "
                  f"{', '.join(label['moods'])} | {', '.join(label['scenes'])}]")


if __name__ == "__main__":
    main()
