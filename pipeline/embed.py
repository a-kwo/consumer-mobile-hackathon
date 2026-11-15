"""Step 5: local embeddings for songs and for the 840 scene keys.

Model: BAAI/bge-small-en-v1.5 (384 dimensions), run locally with fastembed. No API.

Songs and scenes are described with the SAME vocabulary words (shared/vocab.json), so cosine
similarity reflects shared mood and scene words:

  song text   "<moods>, <scene tags>, <times of day>"
  scene text  "<mood hints>, <tag hints>, <time of day>. <pace, weather, time, setting phrases>"

Two details make the similarity term useful in the matching score:

1. Centring. Raw bge vectors of short word lists all point the same way (cosine 0.55 to 0.97).
   Every vector has the mean embedding of the vocabulary words subtracted, then is normalised
   again. The centre depends only on vocab.json, so scenes and songs stay comparable across
   re-runs. Cosines then spread over roughly 0 to 0.9.
2. A scene vector is 0.75 x the hint-word list + 0.25 x the descriptive phrases, so shared words
   dominate and the phrases add colour.

    python embed.py                # scenes, then every labeled song not embedded yet
    python embed.py --scenes-only
    python embed.py --songs-only [--limit N] [--force]
"""
from __future__ import annotations

import argparse
import itertools
import json
from collections import Counter

import numpy as np

from common import CACHE_DIR, TIME_IDS, connect, load_vocab, log

DIMENSIONS = ("paces", "weathers", "timesOfDay", "settings")
WORD_WEIGHT = 0.75  # share of the hint-word list in a scene vector; the rest is the phrases


def load_model(vocab: dict):
    from fastembed import TextEmbedding

    return TextEmbedding(vocab["embedding"]["model"], cache_dir=str(CACHE_DIR / "fastembed"))


def embed_raw(model, texts: list[str]) -> np.ndarray:
    return np.asarray(list(model.embed(texts, batch_size=64)), dtype=np.float64)


def unit(vectors: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(vectors, axis=-1, keepdims=True)
    return vectors / np.maximum(norms, 1e-12)


def vocabulary_centre(model, vocab: dict) -> np.ndarray:
    """Mean raw embedding of every vocabulary word. Deterministic for a given vocab.json."""
    words = list(vocab["moods"]) + list(vocab["sceneTags"]) + list(TIME_IDS)
    return embed_raw(model, words).mean(axis=0)


def centred(model, centre: np.ndarray, texts: list[str]) -> np.ndarray:
    return unit(embed_raw(model, texts) - centre)


def check(vectors: np.ndarray, dimensions: int) -> None:
    assert vectors.ndim == 2 and vectors.shape[1] == dimensions, f"expected {dimensions} dimensions, got {vectors.shape}"
    assert np.all(np.isfinite(vectors)), "non-finite embedding value"
    norms = np.linalg.norm(vectors, axis=1)
    assert np.allclose(norms, 1.0, atol=1e-5), f"vectors are not L2-normalised: {norms.min()}..{norms.max()}"


# --------------------------------------------------------------------------- scenes


def scene_key(pace: str, weather: str, time_of_day: str, setting: str) -> str:
    """Must match sceneKey() in convex/lib/scene.ts."""
    return f"{pace}|{weather}|{time_of_day}|{setting}"


def scene_texts(parts: tuple[dict, dict, dict, dict]) -> tuple[str, str]:
    """(hint-word list, descriptive phrases) for one scene."""
    moods: Counter = Counter()
    tags: Counter = Counter()
    for part in parts:
        moods.update(part["moodHints"])
        tags.update(part["tagHints"])
    # Words shared by several parts of the scene come first; ties keep vocab order.
    ordered_moods = [word for word, _ in sorted(moods.items(), key=lambda item: -item[1])]
    ordered_tags = [word for word, _ in sorted(tags.items(), key=lambda item: -item[1])]
    words = ", ".join(ordered_moods + ordered_tags + [parts[2]["id"]])
    phrases = ", ".join(part["embed"] for part in parts if part["embed"])
    return words, phrases


def build_scenes(model, centre: np.ndarray, vocab: dict) -> list[tuple[str, str, np.ndarray]]:
    keys, word_texts, phrase_texts = [], [], []
    for parts in itertools.product(*(vocab[name] for name in DIMENSIONS)):
        words, phrases = scene_texts(parts)
        keys.append(scene_key(*(part["id"] for part in parts)))
        word_texts.append(words)
        phrase_texts.append(phrases)
    word_vectors = centred(model, centre, word_texts)
    phrase_vectors = centred(model, centre, phrase_texts)
    vectors = unit(WORD_WEIGHT * word_vectors + (1 - WORD_WEIGHT) * phrase_vectors)
    check(vectors, vocab["embedding"]["dimensions"])
    texts = [f"{words}. {phrases}" for words, phrases in zip(word_texts, phrase_texts)]
    return list(zip(keys, texts, vectors))


# --------------------------------------------------------------------------- songs


def song_text(labels: dict) -> str:
    return ", ".join(list(labels["moods"]) + list(labels["scenes"]) + list(labels["timeOfDay"]))


def to_blob(vector: np.ndarray) -> bytes:
    return np.asarray(vector, dtype=np.float32).tobytes()


def from_blob(blob: bytes) -> np.ndarray:
    return np.frombuffer(blob, dtype=np.float32).astype(np.float64)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--scenes-only", action="store_true")
    parser.add_argument("--songs-only", action="store_true")
    parser.add_argument("--limit", type=int, default=None, help="embed at most N songs this run")
    parser.add_argument("--force", action="store_true", help="re-embed songs that already have a vector")
    args = parser.parse_args()

    vocab = load_vocab()
    dimensions = vocab["embedding"]["dimensions"]
    conn = connect()
    model = load_model(vocab)
    centre = vocabulary_centre(model, vocab)

    if not args.songs_only:
        scenes = build_scenes(model, centre, vocab)
        expected = 1
        for name in DIMENSIONS:
            expected *= len(vocab[name])
        assert len(scenes) == expected == len({key for key, _, _ in scenes}), "scene keys are not unique"
        conn.execute("DELETE FROM scenes")
        conn.executemany(
            "INSERT INTO scenes(key, text, embedding) VALUES (?, ?, ?)",
            [(key, text, to_blob(vector)) for key, text, vector in scenes],
        )
        conn.commit()
        log(f"embedded {len(scenes)} scenes ({dimensions} dimensions, L2-normalised)")

    if not args.scenes_only:
        where = "labeled = 1 AND drop_reason IS NULL AND labels IS NOT NULL"
        if not args.force:
            where += " AND embedding IS NULL"
        rows = conn.execute(f"SELECT deezer_id, labels FROM tracks WHERE {where} ORDER BY deezer_id").fetchall()
        if args.limit is not None:
            rows = rows[: args.limit]
        if rows:
            texts = [song_text(json.loads(row["labels"])) for row in rows]
            vectors = centred(model, centre, texts)
            check(vectors, dimensions)
            conn.executemany(
                "UPDATE tracks SET embed_text = ?, embedding = ? WHERE deezer_id = ?",
                [(text, to_blob(vector), row["deezer_id"]) for text, vector, row in zip(texts, vectors, rows)],
            )
            conn.commit()
        log(f"embedded {len(rows)} songs")


if __name__ == "__main__":
    main()
