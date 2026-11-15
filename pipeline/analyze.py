"""Step 3: measure tempo and simple audio features from each 30-second preview.

For every enriched track: fetch a fresh preview URL, download the MP3, decode it (libsndfile, no
ffmpeg needed), measure tempo, loudness, brightness and onset features, then delete the audio.
The final `bpm` is Deezer's when present and plausible, otherwise the measured tempo.

    python analyze.py [--limit N] [--workers 6]
    python analyze.py --report          # agreement between measured tempo and Deezer BPM

Resumable: analysed tracks are skipped.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import time
from concurrent.futures import FIRST_COMPLETED, ProcessPoolExecutor, wait

from common import CACHE_DIR, USER_AGENT, Deezer, DeezerError, connect, log

AUDIO_DIR = CACHE_DIR / "audio"
SR = 22050
HOP = 256
BPM_MIN, BPM_MAX = 40.0, 220.0  # plausible range for a Deezer BPM
FOLD_MIN, FOLD_MAX = 60.0, 185.0  # measured tempo is folded into this range by octaves


# --------------------------------------------------------------------------- tempo


# Comb over the autocorrelation: a true beat period L also correlates at L/2, 2L and 4L, while the
# dotted-rhythm impostors (2:3 and 4:3 of the beat) do not. Weights and prior were tuned on tracks
# that have a Deezer BPM, on one half of the set and checked on the other (see README).
COMB_WEIGHTS = {0.5: 0.75, 1.0: 1.0, 2.0: 1.0, 4.0: 0.5}
PRIOR_CENTRE_BPM = 120.0
PRIOR_OCTAVES = 0.9


def estimate_tempo(onset_env, fps: float) -> tuple[float, float, float]:
    """Tempo from the autocorrelation of the onset envelope.

    Returns (tempo, alternative tempo, confidence). A log-normal prior centred on 120 BPM picks
    the octave; the peak is refined with parabolic interpolation.
    """
    import numpy as np

    env = np.asarray(onset_env, dtype=np.float64)
    env = env - env.mean()
    n = len(env)
    if n < int(fps * 8) or not np.any(env):
        return float("nan"), float("nan"), 0.0
    size = 1 << int(math.ceil(math.log2(2 * n)))
    spectrum = np.fft.rfft(env, size)
    ac = np.fft.irfft(spectrum * np.conj(spectrum))[:n]
    ac = ac / (np.arange(n, 0, -1))  # unbiased
    if ac[0] <= 0:
        return float("nan"), float("nan"), 0.0
    ac = ac / ac[0]

    lag_min = int(math.floor(fps * 60.0 / 240.0))
    lag_max = min(int(math.ceil(fps * 60.0 / 40.0)), n // 3)
    lags = np.arange(lag_min, lag_max + 1)
    bpms = 60.0 * fps / lags

    comb = np.zeros(len(lags))
    for multiple, weight in COMB_WEIGHTS.items():
        position = lags * multiple
        low = np.clip(np.floor(position).astype(int), 0, n - 2)
        fraction = position - np.floor(position)
        value = ac[low] * (1 - fraction) + ac[low + 1] * fraction
        comb += weight * np.where(position < n - 2, value, 0.0)
    prior = np.exp(-0.5 * ((np.log2(bpms) - np.log2(PRIOR_CENTRE_BPM)) / PRIOR_OCTAVES) ** 2)
    score = np.maximum(comb, 0) * prior

    def refine(index: int) -> float:
        lag = float(lags[index])
        if 1 <= index < len(lags) - 1:
            a, b, c = score[index - 1], score[index], score[index + 1]
            denom = a - 2 * b + c
            if denom < 0:
                lag += float(np.clip(0.5 * (a - c) / denom, -0.5, 0.5))
        return 60.0 * fps / lag

    best = int(np.argmax(score))
    if score[best] <= 0:
        return float("nan"), float("nan"), 0.0
    tempo = refine(best)
    confidence = float(np.clip(ac[lags[best]], 0.0, 1.0))

    # Alternative: the best candidate that is not within 6% of the winner.
    mask = np.abs(np.log2(bpms / bpms[best])) > math.log2(1.06)
    alternative = float("nan")
    if np.any(mask):
        second = int(np.argmax(np.where(mask, score, -1)))
        if score[second] > 0:
            alternative = refine(second)
    return float(tempo), float(alternative), confidence


def fold_tempo(tempo: float) -> float:
    if not math.isfinite(tempo) or tempo <= 0:
        return float("nan")
    while tempo < FOLD_MIN:
        tempo *= 2
    while tempo > FOLD_MAX:
        tempo /= 2
    return tempo


# --------------------------------------------------------------------------- worker


def _init_worker() -> None:
    # libmpg123 prints an ID3 warning per file on stderr; silence the workers' stderr.
    devnull = os.open(os.devnull, os.O_WRONLY)
    os.dup2(devnull, 2)


def analyze_audio(path: str) -> dict:
    import librosa
    import numpy as np
    import soundfile as sf

    samples, rate = sf.read(path, dtype="float32", always_2d=True)
    mono = samples.mean(axis=1)
    if rate != SR:
        mono = librosa.resample(mono, orig_sr=rate, target_sr=SR, res_type="soxr_hq")
    seconds = len(mono) / SR
    if seconds < 10:
        return {"error": "clip too short", "seconds": seconds}

    rms = librosa.feature.rms(y=mono, frame_length=2048, hop_length=512)[0]
    rms_db = 20 * np.log10(np.maximum(rms, 1e-6))
    loudness = float(20 * np.log10(max(float(np.sqrt(np.mean(mono ** 2))), 1e-6)))
    if loudness < -55:
        return {"error": "silent clip", "seconds": seconds}

    spectrum = np.abs(librosa.stft(mono, n_fft=2048, hop_length=512))
    freqs = librosa.fft_frequencies(sr=SR, n_fft=2048)
    centroid = librosa.feature.spectral_centroid(S=spectrum, sr=SR)[0]
    flatness = librosa.feature.spectral_flatness(S=spectrum)[0]
    power = spectrum ** 2
    total = float(power.sum()) + 1e-12
    bass = float(power[freqs < 150].sum()) / total
    treble = float(power[freqs > 4000].sum()) / total

    onset_env = librosa.onset.onset_strength(y=mono, sr=SR, hop_length=HOP)
    fps = SR / HOP
    tempo, alternative, pulse = estimate_tempo(onset_env, fps)
    onsets = librosa.onset.onset_detect(onset_envelope=onset_env, sr=SR, hop_length=HOP)

    return {
        "seconds": round(seconds, 2),
        "tempo": tempo,
        "tempo_alt": alternative,
        "pulse": round(pulse, 4),
        "loudness_db": round(loudness, 2),
        "dynamic_range_db": round(float(np.percentile(rms_db, 95) - np.percentile(rms_db, 10)), 2),
        "brightness_hz": round(float(np.mean(centroid)), 1),
        "flatness": round(float(np.mean(flatness)), 5),
        "bass_share": round(bass, 4),
        "treble_share": round(treble, 4),
        "onsets_per_second": round(len(onsets) / seconds, 3),
    }


def process(deezer_id: int, url: str) -> dict:
    """Download one preview, analyse it, delete it. Runs in a worker process."""
    import requests

    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    path = AUDIO_DIR / f"{deezer_id}.mp3"
    try:
        content = None
        for attempt in range(4):
            try:
                response = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=30)
                if response.status_code == 200 and len(response.content) > 20000:
                    content = response.content
                    break
                if response.status_code == 200:  # a stub of a second or two, not a real preview
                    return {"id": deezer_id, "error": "clip too short"}
                if response.status_code in (403, 404, 410):
                    return {"id": deezer_id, "error": f"preview HTTP {response.status_code}"}
            except requests.RequestException:
                pass
            time.sleep(1.5 * (attempt + 1))
        if content is None:
            return {"id": deezer_id, "error": "download failed", "retry": True}
        path.write_bytes(content)
        try:
            result = analyze_audio(str(path))
        except Exception as error:  # undecodable audio must not kill the run
            return {"id": deezer_id, "error": f"decode failed: {type(error).__name__}"}
        result["id"] = deezer_id
        return result
    finally:
        path.unlink(missing_ok=True)


# --------------------------------------------------------------------------- main


def final_bpm(deezer_bpm: float | None, tempo: float | None) -> tuple[float | None, str | None]:
    """Deezer's BPM when present and plausible, else the measured tempo. Both are folded by
    octaves into 60 to 185: Deezer lists some songs at double time (Back In Black at 190), and
    the app counts half and double time as a match anyway."""
    if deezer_bpm and BPM_MIN <= deezer_bpm <= BPM_MAX:
        return round(fold_tempo(float(deezer_bpm)), 1), "deezer"
    if tempo is not None and math.isfinite(tempo) and tempo > 0:
        folded = fold_tempo(tempo)
        if math.isfinite(folded):
            return round(folded, 1), "audio"
    return None, None


def agreement(measured: float, reference: float, tolerance: float = 0.04) -> str:
    """How a measured tempo relates to a reference BPM."""
    if not (measured and reference and math.isfinite(measured)):
        return "none"
    ratio = measured / reference
    for name, target in (("same", 1.0), ("half", 0.5), ("double", 2.0)):
        if abs(ratio / target - 1) <= tolerance:
            return name
    for name, target in (("2:3", 2 / 3), ("3:2", 1.5), ("3:4", 0.75), ("4:3", 4 / 3), ("third", 1 / 3), ("triple", 3.0)):
        if abs(ratio / target - 1) <= tolerance:
            return name
    return "other"


def report(conn) -> None:
    rows = conn.execute(
        "SELECT tempo, tempo_alt, deezer_bpm FROM tracks WHERE analyzed = 1 AND tempo IS NOT NULL "
        "AND deezer_bpm IS NOT NULL AND deezer_bpm BETWEEN ? AND ?",
        (BPM_MIN, BPM_MAX),
    ).fetchall()
    if not rows:
        log("no analysed tracks with a Deezer BPM yet")
        return
    for tolerance in (0.02, 0.04, 0.08):
        counts: dict[str, int] = {}
        for row in rows:
            kind = agreement(row["tempo"], row["deezer_bpm"], tolerance)
            counts[kind] = counts.get(kind, 0) + 1
        agree = sum(counts.get(kind, 0) for kind in ("same", "half", "double"))
        detail = ", ".join(f"{kind} {count}" for kind, count in sorted(counts.items(), key=lambda kv: -kv[1]))
        log(f"tempo vs Deezer BPM within {int(tolerance * 100)}% (half/double allowed): "
            f"{agree}/{len(rows)} = {100 * agree / len(rows):.1f}%  [{detail}]")
    either = sum(
        1 for row in rows
        if agreement(row["tempo"], row["deezer_bpm"]) in ("same", "half", "double")
        or agreement(row["tempo_alt"], row["deezer_bpm"]) in ("same", "half", "double")
    )
    log(f"first or second tempo candidate agrees within 4%: {either}/{len(rows)} = {100 * either / len(rows):.1f}%")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--limit", type=int, default=None, help="analyse at most N tracks this run")
    parser.add_argument("--workers", type=int, default=6)
    parser.add_argument("--report", action="store_true", help="only print tempo agreement with Deezer BPM")
    args = parser.parse_args()

    conn = connect()
    if args.report:
        report(conn)
        return

    api = Deezer(conn)
    rows = conn.execute(
        "SELECT deezer_id, deezer_bpm FROM tracks WHERE selected = 1 AND enriched = 1 AND analyzed = 0 "
        "AND drop_reason IS NULL ORDER BY rank DESC"
    ).fetchall()
    if args.limit is not None:
        rows = rows[: args.limit]
    log(f"{len(rows)} tracks to analyse with {args.workers} workers")
    deezer_bpm = {row["deezer_id"]: row["deezer_bpm"] for row in rows}
    done = dropped = failed = 0

    def record(result: dict) -> None:
        nonlocal done, dropped, failed
        track_id = result["id"]
        if result.get("retry"):
            failed += 1  # left unanalysed: the next run tries again
            return
        if result.get("error"):
            conn.execute(
                "UPDATE tracks SET analyzed = 1, drop_reason = ? WHERE deezer_id = ?",
                (f"analyze:{result['error']}", track_id),
            )
            dropped += 1
            return
        tempo = result.pop("tempo")
        alternative = result.pop("tempo_alt")
        pulse = result.pop("pulse")
        tempo = tempo if math.isfinite(tempo) else None
        alternative = alternative if math.isfinite(alternative) else None
        bpm, source = final_bpm(deezer_bpm.get(track_id), tempo)
        reason = None if bpm else "analyze:no usable tempo"
        result.pop("id")
        conn.execute(
            """UPDATE tracks SET analyzed = 1, tempo = ?, tempo_alt = ?, tempo_conf = ?, features = ?,
                                 bpm = ?, bpm_source = ?, drop_reason = COALESCE(?, drop_reason)
               WHERE deezer_id = ?""",
            (tempo, alternative, pulse, json.dumps(result), bpm, source, reason, track_id),
        )
        if reason:
            dropped += 1
        else:
            done += 1

    pending = set()
    with ProcessPoolExecutor(max_workers=args.workers, initializer=_init_worker) as pool:
        for index, row in enumerate(rows, 1):
            try:
                track = api.get(f"/track/{row['deezer_id']}", cache=False)  # fresh, signed preview URL
            except DeezerError as error:
                log(f"skip {row['deezer_id']} for now: {error}")
                continue
            url = (track or {}).get("preview")
            if not url:
                conn.execute(
                    "UPDATE tracks SET analyzed = 1, drop_reason = 'analyze:no preview' WHERE deezer_id = ?",
                    (row["deezer_id"],),
                )
                dropped += 1
                continue
            pending.add(pool.submit(process, row["deezer_id"], url))
            if len(pending) >= args.workers * 3:
                finished, pending = wait(pending, return_when=FIRST_COMPLETED)
                for future in finished:
                    record(future.result())
                conn.commit()
            if index % 100 == 0:
                log(f"{index}/{len(rows)} analysed {done}, dropped {dropped}, download failures {failed}")
        for future in pending:
            record(future.result())
        conn.commit()

    for leftover in AUDIO_DIR.glob("*.mp3"):
        leftover.unlink(missing_ok=True)
    log(f"analysed {done}, dropped {dropped}, download failures {failed} (rerun to retry)")
    sources = conn.execute(
        "SELECT bpm_source, COUNT(*) FROM tracks WHERE analyzed = 1 AND drop_reason IS NULL GROUP BY bpm_source"
    ).fetchall()
    log("bpm source: " + ", ".join(f"{row[0]} {row[1]}" for row in sources))
    report(conn)


if __name__ == "__main__":
    main()
