"""Shared helpers for the Score song pipeline: paths, .env, SQLite, vocab, Deezer client."""
from __future__ import annotations

import fcntl
import json
import random
import re
import sqlite3
import sys
import time
import unicodedata
import zlib
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / "work.db"
CACHE_DIR = ROOT / "cache"
OUT_DIR = ROOT / "out"
ENV_PATH = ROOT / ".env"
VOCAB_PATH = ROOT.parent / "shared" / "vocab.json"

USER_AGENT = "music-library-builder/0.1"
DEEZER_API = "https://api.deezer.com"
# Deezer allows about 50 requests per 5 seconds per IP. All scripts share this budget.
DEEZER_REQUESTS_PER_SECOND = 6.0


def log(*parts: Any) -> None:
    print(time.strftime("%H:%M:%S"), *parts, flush=True)


# --------------------------------------------------------------------------- .env


def read_env() -> dict[str, str]:
    """Parse pipeline/.env. Keys come ONLY from this file, never from the shell environment."""
    values: dict[str, str] = {}
    if not ENV_PATH.exists():
        return values
    for raw in ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        if key.startswith("export "):
            key = key[len("export "):].strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        elif " #" in value:
            value = value.split(" #", 1)[0].strip()
        values[key] = value
    return values


# --------------------------------------------------------------------------- vocab


def load_vocab() -> dict[str, Any]:
    return json.loads(VOCAB_PATH.read_text(encoding="utf-8"))


TIME_IDS = ("morning", "afternoon", "evening", "night")


# --------------------------------------------------------------------------- SQLite

SCHEMA = """
CREATE TABLE IF NOT EXISTS tracks (
  deezer_id     INTEGER PRIMARY KEY,
  title         TEXT NOT NULL,
  artist        TEXT NOT NULL,
  artist_id     INTEGER,
  album         TEXT,
  album_id      INTEGER,
  duration      INTEGER,
  rank          INTEGER,
  norm_key      TEXT,
  version_flags TEXT,
  selected      INTEGER NOT NULL DEFAULT 0,
  drop_reason   TEXT,
  -- enrich.py
  enriched      INTEGER NOT NULL DEFAULT 0,
  isrc          TEXT,
  cover_url     TEXT,
  deezer_bpm    REAL,
  gain          REAL,
  release_date  TEXT,
  genre         TEXT,
  has_preview   INTEGER,
  -- analyze.py
  analyzed      INTEGER NOT NULL DEFAULT 0,
  tempo         REAL,
  tempo_alt     REAL,
  tempo_conf    REAL,
  features      TEXT,
  bpm           REAL,
  bpm_source    TEXT,
  -- label.py
  labeled       INTEGER NOT NULL DEFAULT 0,
  label_attempts INTEGER NOT NULL DEFAULT 0,
  labels        TEXT,
  confidence    REAL,
  label_model   TEXT,
  -- embed.py
  embed_text    TEXT,
  embedding     BLOB
);
CREATE INDEX IF NOT EXISTS tracks_norm_key ON tracks(norm_key);
CREATE INDEX IF NOT EXISTS tracks_selected ON tracks(selected);

CREATE TABLE IF NOT EXISTS track_tags (
  deezer_id   INTEGER NOT NULL,
  tag         TEXT NOT NULL,
  source      TEXT NOT NULL,
  PRIMARY KEY (deezer_id, tag, source)
);
CREATE INDEX IF NOT EXISTS track_tags_tag ON track_tags(tag);

CREATE TABLE IF NOT EXISTS playlists (
  id        INTEGER PRIMARY KEY,
  title     TEXT,
  owner     TEXT,
  fans      INTEGER,
  nb_tracks INTEGER,
  tag       TEXT,
  query     TEXT
);

CREATE TABLE IF NOT EXISTS scenes (
  key       TEXT PRIMARY KEY,
  text      TEXT NOT NULL,
  embedding BLOB NOT NULL
);

CREATE TABLE IF NOT EXISTS http_cache (
  key        TEXT PRIMARY KEY,
  body       BLOB NOT NULL,
  fetched_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);
"""


# Columns added after the first version of the schema: (name, definition).
EXTRA_TRACK_COLUMNS = (
    # itunes.py: the same recording in the iTunes Store, where the app's previews come from
    ("itunes_checked", "INTEGER NOT NULL DEFAULT 0"),
    ("itunes_track_id", "INTEGER"),
    ("itunes_preview_url", "TEXT"),
    ("itunes_year", "INTEGER"),
    # 1 = the album lookup by UPC was tried, 2 = it was tried but the answer was cut short
    ("itunes_upc_tried", "INTEGER NOT NULL DEFAULT 0"),
)


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=60)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA busy_timeout=60000")
    conn.executescript(SCHEMA)
    existing = {row["name"] for row in conn.execute("PRAGMA table_info(tracks)")}
    for name, definition in EXTRA_TRACK_COLUMNS:
        if name not in existing:
            try:
                conn.execute(f"ALTER TABLE tracks ADD COLUMN {name} {definition}")
            except sqlite3.OperationalError:
                pass  # another process added it first
    conn.commit()
    return conn


def cache_get(conn: sqlite3.Connection, key: str) -> Any:
    row = conn.execute("SELECT body FROM http_cache WHERE key = ?", (key,)).fetchone()
    return json.loads(zlib.decompress(row["body"])) if row is not None else None


def cache_put(conn: sqlite3.Connection, key: str, data: Any) -> None:
    conn.execute(
        "INSERT OR REPLACE INTO http_cache(key, body, fetched_at) VALUES (?, ?, ?)",
        (key, zlib.compress(json.dumps(data).encode("utf-8")), time.time()),
    )
    conn.commit()


# --------------------------------------------------------------------------- rate limiting


class SharedRateLimiter:
    """A minimum interval between calls, shared by every process through a lock file."""

    def __init__(self, name: str, per_second: float):
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        self.path = CACHE_DIR / f"{name}.rate"
        self.interval = 1.0 / per_second

    def wait(self) -> None:
        with open(self.path, "a+") as handle:
            fcntl.flock(handle, fcntl.LOCK_EX)
            try:
                handle.seek(0)
                try:
                    last = float(handle.read().strip() or 0)
                except ValueError:
                    last = 0.0
                delay = last + self.interval - time.time()
                if delay > 0:
                    time.sleep(delay)
                handle.seek(0)
                handle.truncate()
                handle.write(repr(time.time()))
                handle.flush()
            finally:
                fcntl.flock(handle, fcntl.LOCK_UN)


def backoff_sleep(attempt: int, base: float = 1.0, cap: float = 60.0) -> None:
    time.sleep(min(cap, base * (2 ** attempt)) * (0.5 + random.random()))


# --------------------------------------------------------------------------- Deezer


class DeezerError(RuntimeError):
    pass


def _scrub(value: Any) -> Any:
    """Remove signed, expiring or noisy fields before a response is cached."""
    if isinstance(value, dict):
        out = {}
        for key, item in value.items():
            if key == "preview":
                out["has_preview"] = bool(item)
            elif key in ("track_token", "share", "available_countries"):
                continue
            else:
                out[key] = _scrub(item)
        return out
    if isinstance(value, list):
        return [_scrub(item) for item in value]
    return value


class Deezer:
    """Polite Deezer API client: shared rate limit, retries with backoff, SQLite response cache.

    Cached responses never contain preview URLs (they are signed and expire); they carry
    `has_preview` instead. Call `get(..., cache=False)` when a fresh preview URL is needed.
    """

    def __init__(self, conn: sqlite3.Connection | None = None):
        import requests

        self.conn = conn
        self.session = requests.Session()
        self.session.headers["User-Agent"] = USER_AGENT
        self.limiter = SharedRateLimiter("deezer", DEEZER_REQUESTS_PER_SECOND)
        self.calls = 0
        self.cache_hits = 0

    @staticmethod
    def _cache_key(path: str, params: dict[str, Any] | None) -> str:
        query = "&".join(f"{k}={params[k]}" for k in sorted(params)) if params else ""
        return f"deezer:{path}?{query}"

    def get(self, path: str, params: dict[str, Any] | None = None, *, cache: bool = True) -> dict | None:
        """GET a Deezer API path. Returns None when Deezer says the object does not exist."""
        import requests

        key = self._cache_key(path, params)
        if cache and self.conn is not None:
            row = self.conn.execute("SELECT body FROM http_cache WHERE key = ?", (key,)).fetchone()
            if row is not None:
                self.cache_hits += 1
                return json.loads(zlib.decompress(row["body"]))

        last_error = "unknown"
        for attempt in range(7):
            self.limiter.wait()
            self.calls += 1
            try:
                response = self.session.get(DEEZER_API + path, params=params, timeout=25)
            except requests.RequestException as error:
                last_error = type(error).__name__
                backoff_sleep(attempt)
                continue
            if response.status_code == 429 or response.status_code >= 500:
                last_error = f"HTTP {response.status_code}"
                backoff_sleep(attempt, base=2.0)
                continue
            try:
                data = response.json()
            except ValueError:
                last_error = "invalid JSON"
                backoff_sleep(attempt)
                continue
            # Deezer reports errors with HTTP 200 and an `error` object.
            error = data.get("error") if isinstance(data, dict) else None
            if error:
                code = error.get("code")
                if code == 4:  # quota exceeded
                    last_error = "quota"
                    time.sleep(5.5 + 2.0 * attempt)
                    continue
                if code == 800:  # no data
                    data = None
                elif code in (700, 2):  # service busy / temporary
                    last_error = f"deezer error {code}"
                    backoff_sleep(attempt, base=2.0)
                    continue
                else:
                    raise DeezerError(f"{path}: {error}")
            if self.conn is not None and cache:
                body = zlib.compress(json.dumps(_scrub(data)).encode("utf-8"))
                self.conn.execute(
                    "INSERT OR REPLACE INTO http_cache(key, body, fetched_at) VALUES (?, ?, ?)",
                    (key, body, time.time()),
                )
                self.conn.commit()
            return data
        raise DeezerError(f"{path}: gave up after retries ({last_error})")


# --------------------------------------------------------------------------- titles

_BRACKETS = re.compile(r"\([^)]*\)|\[[^\]]*\]|\{[^}]*\}")
_VERSION_WORDS = (
    r"remaster(?:ed)?|re-?master(?:ed)?|radio|edit|version|mono|stereo|live|mix|remix|acoustic|demo|"
    r"bonus|single|deluxe|from|feat|ft|instrumental|session|sessions|take|explicit|clean|original|"
    r"extended|soundtrack|anniversary|edition|unplugged|recorded|re-?recorded|rework|bootleg|"
    r"19\d\d|20\d\d"
)
_DASH_SUFFIX = re.compile(rf"\s[-–—]\s(?=[^-–—]*\b(?:{_VERSION_WORDS})\b).*$", re.IGNORECASE)
_FEAT = re.compile(r"\b(?:feat|ft|featuring)\b\.?.*$", re.IGNORECASE)

# Versions we never want in the library.
_HARD_VERSION = re.compile(
    r"karaoke|tribute|made famous|originally performed|in the style of|cover version|nightcore|"
    r"sped[ -]?up|speed[ -]?up|slowed|8d audio|\b8d\b|reverb|lullaby|instrumental version|commentary|"
    r"megamix|medley|workout (?:re)?mix|ringtone|backing track|music box|\bchipmunk",
    re.IGNORECASE,
)
# Versions that lose to the plain recording when both exist.
_SOFT_VERSION = re.compile(
    r"\blive\b|remix|\bmix\b|acoustic|\bdemo\b|unplugged|session|instrumental|rework|bootleg|"
    r"extended|\bedit\b|re-?recorded|a cappella|acapella|orchestral|piano version|stripped",
    re.IGNORECASE,
)


def fold(text: str) -> str:
    """Lower-case ASCII with accents removed."""
    text = unicodedata.normalize("NFKD", text or "")
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return text.lower().replace("&", " and ")


def normalize_title(title: str) -> str:
    """Title without version noise, so remasters, edits and live takes share one key."""
    text = fold(title)
    stripped = _BRACKETS.sub(" ", text)
    stripped = _DASH_SUFFIX.sub("", stripped)
    stripped = _FEAT.sub("", stripped)
    stripped = re.sub(r"[^a-z0-9]+", " ", stripped).strip()
    if not stripped:  # the whole title was in brackets
        stripped = re.sub(r"[^a-z0-9]+", " ", text).strip()
    return stripped


def normalize_artist(artist: str) -> str:
    text = fold(artist)
    text = re.split(r"\s(?:feat|ft|featuring|x|vs)\.?\s|,|;|\s/\s", text)[0]
    text = re.sub(r"^the\s+", "", text)
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


def norm_key(artist: str, title: str) -> str:
    return f"{normalize_artist(artist)}|{normalize_title(title)}"


def version_flags(title: str) -> str:
    """'hard' for versions to drop, 'soft' for versions that lose to the plain one, else ''."""
    extra = " ".join(_BRACKETS.findall(title)) + " " + " ".join(re.split(r"\s[-–—]\s", title)[1:])
    if _HARD_VERSION.search(title):
        return "hard"
    if _SOFT_VERSION.search(extra):
        return "soft"
    return ""


def felt_bpm(bpm: float, energy: float) -> float:
    """The tempo a listener feels. Calm music is felt at the slower pulse, but both Deezer and
    the analyser often report the double: "Imagine" at 151, "Don't Know Why" at 177. So a calm
    song with a fast tempo is halved. Slow walks then find calm songs at 50 to 90 BPM."""
    if (energy < 0.3 and bpm > 100) or (energy < 0.4 and bpm > 140):
        return round(bpm / 2.0, 1)
    return bpm


def die(message: str) -> None:
    print(message, file=sys.stderr)
    raise SystemExit(1)
