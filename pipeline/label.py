"""Step 4: label songs with an LLM (energy, valence, tension, moods, scenes, time of day...).

Songs go to the model in batches of 20 with artist, title, album, year, genre, crowd tags, BPM
and audio measurements. The model returns strict JSON; every row is validated against
shared/vocab.json (unknown terms dropped, numbers clamped). A row with no valid mood or scene is
retried once. Rows with confidence under 0.6 are dropped.

Keys are read ONLY from pipeline/.env (never from the shell environment):
  LABEL_ANTHROPIC_API_KEY  -> Anthropic (default model claude-opus-5-5)
  LABEL_OPENAI_API_KEY     -> OpenAI (a current model is chosen from the account's model list)
  LABEL_MODEL              -> optional model override
  LABEL_EFFORT             -> optional: low | medium | high (Anthropic effort, default medium)

    python label.py --dry-run          # print one prompt, call nothing
    python label.py --self-test        # check parsing and validation against a mocked response
    python label.py --limit 60         # label 60 songs
    python label.py                    # label everything that is not labeled yet

Resumable: labeled songs are skipped.
"""
from __future__ import annotations

import argparse
import json
import os
import random
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

from common import TIME_IDS, connect, die, load_vocab, log, read_env

BATCH_SIZE = 20
MIN_CONFIDENCE = 0.6
MAX_ATTEMPTS = 2  # a rejected row is retried once
ANTHROPIC_DEFAULT_MODEL = "claude-opus-5-5"
# Models that accept server-side refusal fallbacks (`fallbacks: "default"`).
ANTHROPIC_FALLBACK_MODELS = {"claude-opus-5-5", "claude-opus-5", "claude-fable-5-2", "claude-fable-5-1", "claude-sonnet-5-5"}
NUMBER_FIELDS = ("energy", "valence", "tension", "social", "vocal", "confidence")


class LabelError(RuntimeError):
    """A batch failed in a way that is worth retrying later."""


class FatalLabelError(RuntimeError):
    """Bad key, bad model or bad request: stop the run."""


# --------------------------------------------------------------------------- prompt


def system_prompt(vocab: dict) -> str:
    return f"""You label songs for Score, a mobile app that soundtracks a person's day. The app reads how fast someone is walking or running, the weather, the time of day and where they are, and plays the existing song that best fits that moment. Your labels are the only thing the app knows about each song, so they decide which song plays when. Describe how each recording actually sounds and feels to a listener: not its reputation, not its chart success, not the lyrics alone.

For each song you receive: artist, title, album, the year listed by a streaming service (often a reissue date, not the original release), a genre, crowd tags, the tempo in BPM, and measurements taken from a 30-second preview clip (loudness in dBFS, dynamic range in dB, brightness as spectral centroid in Hz, note onsets per second, the share of energy in the bass, and pulse clarity from 0 to 1).

How to weigh the inputs:
- Your own knowledge of the recording comes first.
- Crowd tags are the names of playlists the song was found in. They are noisy and often wrong. Treat them as weak hints, and never copy a tag into the labels unless it truly fits the song.
- The audio measurements cover only a 30-second excerpt. They help most when you know the song less well.

Fields to return for every song:

energy (0 to 1): the intensity and activity of the recording.
  0.05-0.15  ambient, drones, sleep music, a solo piano played very softly
  0.20-0.30  quiet acoustic ballad, slow jazz, hushed singer-songwriter
  0.40-0.50  mid-tempo pop, laid-back soul or indie, an easy groove
  0.60-0.70  upbeat pop, driving rock, dance-pop with a firm beat
  0.80-0.90  peak-time dance music, hard rock, punk, hard-hitting hip hop
  0.95+      thrash or extreme metal, hardcore, drum and bass at full tilt

valence (0 to 1): how positive the music feels.
  0.05-0.15  despair, grief, bleakness
  0.25-0.35  sad, melancholy, brooding, uneasy
  0.45-0.55  bittersweet, neutral, cool or detached
  0.65-0.75  warm, content, feel-good
  0.85-0.95  joyful, exuberant, celebratory

tension (0 to 1): unease, suspense, aggression or urgency.
  0.10 fully relaxed and resolved; 0.35 a little restless or wistful; 0.60 pushing, urgent, edgy; 0.90 menacing, anxious, about to snap

social (0 to 1): who the song is for.
  0.0 solitary listening (headphones, introspection); 0.5 small company or background; 1.0 made for a crowd (party, dance floor, stadium, singalong)

vocal (0 to 1): the role of the voice.
  0.0 instrumental; 0.3 sparse, wordless or sampled vocals; 0.6 vocals share the space with the band; 1.0 voice-forward (rap, a cappella, a belted lead)

moods: 2 to 4 terms from the mood list, ordered from most to least defining. The order matters: the app shows the first two moods to the listener as the reason the song was picked, so they must be the two words that best capture the song.
scenes: 2 to 4 terms from the scene list: moments this song would soundtrack well, the best fit first.
timeOfDay: 1 to 3 of morning, afternoon, evening, night: when the song fits best.
releaseYear: the year the recording was first released, from your own knowledge (use the listed year if you do not know).
seasonal: true only for Christmas, holiday or other strictly seasonal songs.
confidence (0 to 1): how sure you are that you know this exact recording and that your labels are right.
  0.90+ you know the song well; 0.75 you know the artist and this kind of song, and the labels are very likely right; 0.50 you are inferring from the title, tags and measurements; below 0.40 you do not recognise it.
  Be honest. Songs under 0.6 are dropped from the library, and a confident wrong label is worse than a dropped song.

Calibration:
- Use the whole range of every scale, to two decimals. A varied batch should contain energy and valence values from near 0.1 to above 0.9. Do not bunch values between 0.5 and 0.7.
- Judge each song on its own. A sad song can be energetic (high energy, low valence); a calm song can be happy (low energy, high valence).
- Energy describes the sound, not the tempo: a fast fingerpicked folk song is still low energy.
- timeOfDay: think about when a listener would actually reach for the song, and use the whole day. Fresh, bright, optimistic or gently waking music fits the morning; busy, sunny, upbeat daytime music fits the afternoon; warm, social or winding-down music fits the evening; dark, intimate, nocturnal or late-party music fits the night. Do not default to evening and night.

Allowed moods: {", ".join(vocab["moods"])}
Allowed scenes: {", ".join(vocab["sceneTags"])}

Return one entry per song, in the same order, with the same id. Use only the allowed terms, spelled exactly as listed."""


def song_payload(index: int, row, tags: list[str]) -> dict:
    features = json.loads(row["features"] or "{}")
    payload = {
        "id": index,
        "artist": row["artist"],
        "title": row["title"],
    }
    if row["album"]:
        payload["album"] = row["album"]
    if row["release_date"]:
        payload["listedYear"] = int(row["release_date"][:4])
    if row["genre"]:
        payload["genre"] = row["genre"]
    if tags:
        payload["crowdTags"] = tags
    payload["bpm"] = round(row["bpm"])
    audio = {
        "loudnessDb": features.get("loudness_db"),
        "dynamicRangeDb": features.get("dynamic_range_db"),
        "brightnessHz": round(features["brightness_hz"]) if features.get("brightness_hz") else None,
        "onsetsPerSecond": features.get("onsets_per_second"),
        "bassShare": features.get("bass_share"),
        "pulseClarity": round(row["tempo_conf"], 2) if row["tempo_conf"] is not None else None,
    }
    payload["audio"] = {key: value for key, value in audio.items() if value is not None}
    return payload


def user_prompt(payloads: list[dict]) -> str:
    return (
        f"Label these {len(payloads)} songs. Return an object with a `songs` array holding one entry "
        f"per song, in the same order, each with the song's `id`.\n\n"
        + json.dumps(payloads, ensure_ascii=False, indent=1)
    )


def output_schema(vocab: dict) -> dict:
    def terms(allowed) -> dict:
        return {"type": "array", "items": {"type": "string", "enum": list(allowed)}}

    properties = {
        "id": {"type": "integer"},
        "energy": {"type": "number"},
        "valence": {"type": "number"},
        "tension": {"type": "number"},
        "social": {"type": "number"},
        "vocal": {"type": "number"},
        "moods": terms(vocab["moods"]),
        "scenes": terms(vocab["sceneTags"]),
        "timeOfDay": terms(TIME_IDS),
        "releaseYear": {"type": "integer"},
        "seasonal": {"type": "boolean"},
        "confidence": {"type": "number"},
    }
    song = {"type": "object", "properties": properties, "required": list(properties), "additionalProperties": False}
    return {
        "type": "object",
        "properties": {"songs": {"type": "array", "items": song}},
        "required": ["songs"],
        "additionalProperties": False,
    }


# --------------------------------------------------------------------------- validation


def _terms(value, allowed, most: int) -> list[str]:
    """Known vocabulary terms only, in order, without repeats."""
    if not isinstance(value, list):
        return []
    lookup = {term.lower(): term for term in allowed}
    kept: list[str] = []
    for item in value:
        if not isinstance(item, str):
            continue
        term = lookup.get(item.strip().lower())
        if term and term not in kept:
            kept.append(term)
    return kept[:most]


def validate_label(raw: dict, vocab: dict) -> tuple[dict | None, str | None]:
    """Returns (clean label, None) or (None, reason it was rejected)."""
    if not isinstance(raw, dict):
        return None, "not an object"
    label: dict = {}
    for name in NUMBER_FIELDS:
        value = raw.get(name)
        if isinstance(value, bool) or not isinstance(value, (int, float)) or value != value:
            return None, f"{name} is not a number"
        label[name] = round(min(1.0, max(0.0, float(value))), 3)
    label["moods"] = _terms(raw.get("moods"), vocab["moods"], 4)
    label["scenes"] = _terms(raw.get("scenes"), vocab["sceneTags"], 4)
    label["timeOfDay"] = _terms(raw.get("timeOfDay"), TIME_IDS, 3)
    if not label["moods"]:
        return None, "no valid mood"
    if not label["scenes"]:
        return None, "no valid scene"
    if not label["timeOfDay"]:
        return None, "no valid time of day"
    year = raw.get("releaseYear")
    label["releaseYear"] = int(year) if isinstance(year, (int, float)) and 1500 <= year <= 2027 else None
    label["seasonal"] = raw.get("seasonal") is True
    return label, None


def parse_response(text: str, count: int, vocab: dict) -> dict[int, tuple[dict | None, str | None]]:
    """Map each batch index (1..count) to its validated label or a rejection reason."""
    try:
        data = json.loads(text)
    except ValueError:
        match = re.search(r"\{.*\}", text, re.DOTALL)  # tolerate a code fence around the JSON
        if not match:
            raise LabelError("response is not JSON")
        try:
            data = json.loads(match.group(0))
        except ValueError as error:
            raise LabelError("response is not JSON") from error
    songs = data.get("songs") if isinstance(data, dict) else data
    if not isinstance(songs, list):
        raise LabelError("response has no songs array")
    results: dict[int, tuple[dict | None, str | None]] = {}
    for entry in songs:
        index = entry.get("id") if isinstance(entry, dict) else None
        if isinstance(index, bool) or not isinstance(index, int) or not 1 <= index <= count or index in results:
            continue
        results[index] = validate_label(entry, vocab)
    for index in range(1, count + 1):
        results.setdefault(index, (None, "missing from response"))
    return results


# --------------------------------------------------------------------------- providers


def scrub_environment() -> None:
    """Keys come only from pipeline/.env: remove every provider variable inherited from the shell."""
    for name in list(os.environ):
        if name.startswith(("ANTHROPIC_", "OPENAI_")):
            del os.environ[name]


def redact(text: str, secret: str) -> str:
    return text.replace(secret, "[key]") if secret else text


class AnthropicLabeler:
    name = "anthropic"

    def __init__(self, api_key: str, model: str | None, effort: str | None):
        import anthropic

        self._anthropic = anthropic
        self._key = api_key
        self.model = model or ANTHROPIC_DEFAULT_MODEL
        self.effort = effort or "medium"
        self.client = anthropic.Anthropic(
            api_key=api_key, base_url="https://api.anthropic.com", max_retries=4, timeout=600.0
        )

    def complete(self, system: str, user: str, schema: dict) -> tuple[str, dict]:
        anthropic = self._anthropic
        output_config: dict = {"format": {"type": "json_schema", "schema": schema}}
        if self.effort != "none":
            output_config["effort"] = self.effort
        request = dict(
            model=self.model,
            max_tokens=16000,
            # The system prompt is identical for every batch: cache it.
            system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
            messages=[{"role": "user", "content": user}],
            output_config=output_config,
        )
        try:
            if self.model in ANTHROPIC_FALLBACK_MODELS:
                # If a safety classifier declines a batch, the API re-runs it on the recommended
                # fallback model inside the same call instead of returning a refusal.
                response = self.client.beta.messages.create(
                    betas=["server-side-fallback-2026-07-01"], fallbacks="default", **request
                )
            else:
                response = self.client.messages.create(**request)
        except (anthropic.AuthenticationError, anthropic.PermissionDeniedError) as error:
            raise FatalLabelError(f"Anthropic rejected the key ({type(error).__name__})") from None
        except anthropic.NotFoundError:
            raise FatalLabelError(f"Anthropic does not know the model {self.model!r}") from None
        except anthropic.BadRequestError as error:
            raise FatalLabelError(f"Anthropic bad request: {redact(str(error.message), self._key)}") from None
        except anthropic.RateLimitError:
            raise LabelError("rate limited") from None
        except anthropic.APIStatusError as error:
            raise LabelError(f"Anthropic HTTP {error.status_code}") from None
        except anthropic.APIConnectionError:
            raise LabelError("network error") from None

        if response.stop_reason == "refusal":
            raise LabelError("the model declined this batch")
        if response.stop_reason == "max_tokens":
            raise LabelError("response was cut off at max_tokens")
        text = next((block.text for block in response.content if block.type == "text"), None)
        if not text:
            raise LabelError("empty response")
        usage = response.usage
        return text, {
            "input": (usage.input_tokens or 0) + (getattr(usage, "cache_read_input_tokens", 0) or 0)
            + (getattr(usage, "cache_creation_input_tokens", 0) or 0),
            "output": usage.output_tokens or 0,
        }


def pick_openai_model(model_ids: list[str]) -> str | None:
    """The newest general GPT model the account can use, chosen from its own model list."""
    excluded = ("mini", "nano", "audio", "realtime", "search", "transcribe", "tts", "image", "codex",
                "instruct", "vision", "preview", "pro", "chat", "embedding", "moderation", "turbo")
    best: tuple[float, int, str] | None = None
    for model_id in model_ids:
        match = re.fullmatch(r"gpt-(\d+(?:\.\d+)?)([a-z]?)((?:-[a-z0-9]+)*)", model_id)
        if not match:
            continue
        suffix = match.group(3)
        if any(word in suffix.split("-") for word in excluded) or re.search(r"-\d{4}", suffix):
            continue
        candidate = (float(match.group(1)), -len(model_id), model_id)
        if best is None or candidate > best:
            best = candidate
    return best[2] if best else None


class OpenAILabeler:
    name = "openai"

    def __init__(self, api_key: str, model: str | None, effort: str | None):
        import openai

        self._openai = openai
        self._key = api_key
        self.client = openai.OpenAI(api_key=api_key, base_url="https://api.openai.com/v1", max_retries=4, timeout=600.0)
        if model:
            self.model = model
        else:
            try:
                available = [entry.id for entry in self.client.models.list()]
            except (openai.AuthenticationError, openai.PermissionDeniedError) as error:
                raise FatalLabelError(f"OpenAI rejected the key ({type(error).__name__})") from None
            chosen = pick_openai_model(available)
            if not chosen:
                raise FatalLabelError("could not choose an OpenAI model from the account's list: set LABEL_MODEL")
            self.model = chosen

    def complete(self, system: str, user: str, schema: dict) -> tuple[str, dict]:
        openai = self._openai
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
                response_format={
                    "type": "json_schema",
                    "json_schema": {"name": "song_labels", "schema": schema, "strict": True},
                },
            )
        except (openai.AuthenticationError, openai.PermissionDeniedError) as error:
            raise FatalLabelError(f"OpenAI rejected the key ({type(error).__name__})") from None
        except openai.NotFoundError:
            raise FatalLabelError(f"OpenAI does not know the model {self.model!r}") from None
        except openai.BadRequestError as error:
            raise FatalLabelError(f"OpenAI bad request: {redact(str(error.message), self._key)}") from None
        except openai.RateLimitError:
            raise LabelError("rate limited") from None
        except openai.APIStatusError as error:
            raise LabelError(f"OpenAI HTTP {error.status_code}") from None
        except openai.APIConnectionError:
            raise LabelError("network error") from None

        choice = response.choices[0]
        if choice.finish_reason == "length":
            raise LabelError("response was cut off")
        text = choice.message.content
        if not text:
            raise LabelError("empty response or refusal")
        usage = response.usage
        return text, {"input": getattr(usage, "prompt_tokens", 0) or 0, "output": getattr(usage, "completion_tokens", 0) or 0}


def make_labeler(env: dict[str, str]):
    model = env.get("LABEL_MODEL") or None
    effort = (env.get("LABEL_EFFORT") or "").lower() or None
    if env.get("LABEL_ANTHROPIC_API_KEY"):
        return AnthropicLabeler(env["LABEL_ANTHROPIC_API_KEY"], model, effort)
    if env.get("LABEL_OPENAI_API_KEY"):
        return OpenAILabeler(env["LABEL_OPENAI_API_KEY"], model, effort)
    return None


# --------------------------------------------------------------------------- batches


def load_batch_rows(conn, limit: int | None):
    rows = conn.execute(
        """SELECT * FROM tracks
           WHERE analyzed = 1 AND drop_reason IS NULL AND labeled = 0 AND bpm IS NOT NULL AND label_attempts < ?
           ORDER BY (deezer_id * 2654435761) % 1000003""",  # a fixed shuffle: every batch is a varied mix
        (MAX_ATTEMPTS,),
    ).fetchall()
    return rows if limit is None else rows[:limit]


def tags_for(conn, deezer_id: int) -> list[str]:
    rows = conn.execute(
        "SELECT tag, COUNT(*) AS n FROM track_tags WHERE deezer_id = ? GROUP BY tag ORDER BY n DESC, tag", (deezer_id,)
    ).fetchall()
    return [row["tag"] for row in rows][:12]


def label_batch(labeler, system: str, schema: dict, vocab: dict, payloads: list[dict]):
    """Call the model for one batch, with backoff on rate limits and transient failures."""
    last = "unknown"
    for attempt in range(5):
        try:
            text, usage = labeler.complete(system, user_prompt(payloads), schema)
            return parse_response(text, len(payloads), vocab), usage
        except LabelError as error:
            last = str(error)
            time.sleep(min(90.0, 4.0 * (2 ** attempt)) * (0.5 + random.random()))
    raise LabelError(last)


def store(conn, row, result: tuple[dict | None, str | None], model: str) -> str:
    label, problem = result
    attempts = row["label_attempts"] + 1
    if label is None:
        reason = f"label:invalid ({problem})" if attempts >= MAX_ATTEMPTS else None
        conn.execute(
            "UPDATE tracks SET label_attempts = ?, drop_reason = COALESCE(?, drop_reason) WHERE deezer_id = ?",
            (attempts, reason, row["deezer_id"]),
        )
        return "rejected" if reason else "retry"
    confidence = label.pop("confidence")
    seasonal = label.pop("seasonal")
    reason = None
    if seasonal:
        reason = "label:seasonal"
    elif confidence < MIN_CONFIDENCE:
        reason = "label:low confidence"
    conn.execute(
        """UPDATE tracks SET labeled = 1, label_attempts = ?, labels = ?, confidence = ?, label_model = ?,
                             drop_reason = COALESCE(?, drop_reason), embedding = NULL, embed_text = NULL
           WHERE deezer_id = ?""",
        (attempts, json.dumps(label), confidence, model, reason, row["deezer_id"]),
    )
    return "seasonal" if seasonal else ("low confidence" if reason else "labeled")


def bump_meta(conn, key: str, amount: int) -> None:
    current = conn.execute("SELECT value FROM meta WHERE key = ?", (key,)).fetchone()
    total = int(current["value"]) + amount if current else amount
    conn.execute("INSERT OR REPLACE INTO meta(key, value) VALUES (?, ?)", (key, str(total)))


# --------------------------------------------------------------------------- self-test


def self_test(vocab: dict) -> None:
    mood, scene = vocab["moods"][0], vocab["sceneTags"][0]
    good = {"id": 1, "energy": 0.82, "valence": 0.4, "tension": 0.7, "social": 0.6, "vocal": 0.9,
            "moods": ["energetic", "driving"], "scenes": ["running", "workout"], "timeOfDay": ["afternoon"],
            "releaseYear": 2002, "seasonal": False, "confidence": 0.95}
    mocked = {"songs": [
        good,
        # out-of-range numbers are clamped, unknown and repeated terms dropped, long lists cut to 4
        {**good, "id": 2, "energy": 1.7, "valence": -0.2, "moods": ["Energetic ", "sparkly", mood, mood, "epic", "dark", "tense"],
         "scenes": ["made up", scene], "timeOfDay": ["night", "midnight"], "releaseYear": 1492},
        {**good, "id": 3, "moods": ["sparkly"]},                 # no valid mood -> rejected
        {**good, "id": 4, "scenes": []},                         # no valid scene -> rejected
        {**good, "id": 5, "energy": "high"},                     # not a number -> rejected
        {**good, "id": 6, "confidence": 0.3},                    # valid, dropped later for low confidence
        {**good, "id": 7, "seasonal": True},
        {**good, "id": 99},                                      # unknown id -> ignored
    ]}
    results = parse_response("```json\n" + json.dumps(mocked) + "\n```", 8, vocab)
    assert results[1][0] and results[1][0]["energy"] == 0.82 and results[1][0]["moods"] == ["energetic", "driving"]
    second = results[2][0]
    assert second and second["energy"] == 1.0 and second["valence"] == 0.0, second
    assert second["moods"] == ["energetic", mood, "epic", "dark"][:4] or len(second["moods"]) == 4, second
    assert "sparkly" not in second["moods"] and second["scenes"] == [scene] and second["timeOfDay"] == ["night"]
    assert second["releaseYear"] is None
    assert results[3] == (None, "no valid mood") and results[4] == (None, "no valid scene")
    assert results[5] == (None, "energy is not a number")
    assert results[6][0] and results[6][0]["confidence"] == 0.3
    assert results[7][0] and results[7][0]["seasonal"] is True
    assert results[8] == (None, "missing from response")
    try:
        parse_response("sorry, I cannot do that", 2, vocab)
        raise AssertionError("non-JSON response was accepted")
    except LabelError:
        pass
    schema = output_schema(vocab)
    assert schema["properties"]["songs"]["items"]["additionalProperties"] is False
    assert pick_openai_model(["gpt-9-mini", "gpt-8.5", "gpt-9", "gpt-9-2030-01-01", "gpt-9-pro", "o9", "text-embedding-9"]) == "gpt-9"
    print("self-test passed: parsing, clamping, vocabulary filtering, rejection and model choice")


# --------------------------------------------------------------------------- main


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--limit", type=int, default=None, help="label at most N songs this run")
    parser.add_argument("--concurrency", type=int, default=4, help="requests in flight")
    parser.add_argument("--dry-run", action="store_true", help="print one prompt and exit without calling anything")
    parser.add_argument("--self-test", action="store_true", help="check parsing and validation on a mocked response")
    args = parser.parse_args()

    scrub_environment()
    vocab = load_vocab()
    if args.self_test:
        self_test(vocab)
        return

    conn = connect()
    system = system_prompt(vocab)
    schema = output_schema(vocab)
    rows = load_batch_rows(conn, args.limit)
    batches = [rows[start:start + BATCH_SIZE] for start in range(0, len(rows), BATCH_SIZE)]
    payloads = [
        [song_payload(index, row, tags_for(conn, row["deezer_id"])) for index, row in enumerate(batch, 1)]
        for batch in batches
    ]

    if args.dry_run:
        print("=== system prompt ===\n" + system)
        print("\n=== user prompt (batch 1 of %d) ===" % len(batches))
        print(user_prompt(payloads[0]) if payloads else "(no songs waiting for labels)")
        print("\n=== output schema ===\n" + json.dumps(schema)[:600] + " ...")
        print(f"\n{len(rows)} songs waiting, {len(batches)} requests of up to {BATCH_SIZE}. Nothing was called.")
        return

    try:
        labeler = make_labeler(read_env())
    except FatalLabelError as error:
        die(str(error))
    if labeler is None:
        die("No label key in pipeline/.env: set LABEL_ANTHROPIC_API_KEY or LABEL_OPENAI_API_KEY, then rerun.")
    log(f"provider {labeler.name}, model {labeler.model}; {len(rows)} songs in {len(batches)} requests")
    if not batches:
        return

    counts: dict[str, int] = {}
    tokens = {"input": 0, "output": 0}
    done = 0
    with ThreadPoolExecutor(max_workers=max(1, args.concurrency)) as pool:
        futures = {
            pool.submit(label_batch, labeler, system, schema, vocab, payload): batch
            for batch, payload in zip(batches, payloads)
        }
        for future in as_completed(futures):
            batch = futures[future]
            try:
                results, usage = future.result()
            except FatalLabelError as error:
                for other in futures:
                    other.cancel()
                conn.commit()
                die(f"stopped: {error}")
            except LabelError as error:
                counts["failed batches"] = counts.get("failed batches", 0) + 1
                log(f"batch failed, its songs stay unlabeled for the next run: {error}")
                continue
            for index, row in enumerate(batch, 1):
                outcome = store(conn, row, results[index], labeler.model)
                counts[outcome] = counts.get(outcome, 0) + 1
            for key in tokens:
                tokens[key] += usage[key]
            bump_meta(conn, "label_requests", 1)
            bump_meta(conn, "label_input_tokens", usage["input"])
            bump_meta(conn, "label_output_tokens", usage["output"])
            conn.execute("INSERT OR REPLACE INTO meta(key, value) VALUES ('label_provider', ?)", (f"{labeler.name}:{labeler.model}",))
            conn.commit()
            done += 1
            if done % 5 == 0 or done == len(batches):
                log(f"{done}/{len(batches)} requests: " + ", ".join(f"{name} {count}" for name, count in sorted(counts.items())))

    log("done: " + ", ".join(f"{name} {count}" for name, count in sorted(counts.items())))
    log(f"tokens this run: {tokens['input']} in, {tokens['output']} out")
    if counts.get("retry") or counts.get("failed batches"):
        log("some songs were rejected once or their batch failed: run label.py again to retry them")


if __name__ == "__main__":
    main()
