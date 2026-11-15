/**
 * Fresh 30-second preview URLs. Deezer's are signed and expire within minutes,
 * so they are fetched at request time and NEVER stored. When Deezer has none
 * (no preview, over quota, or blocked) the iTunes Search API is the fallback.
 *
 * Uses `fetch`, so this only runs inside actions.
 */
import { TUNING } from '../tuning';

export type PreviewSource = 'deezer' | 'itunes';
export type Preview = { url: string; source: PreviewSource };
export type PreviewLookup = { deezerId: number; artist: string; title: string; itunesTrackId?: number };

/** A response body, or `blocked` when the server refused, failed or did not answer in time. */
type Fetched = { blocked: false; body: unknown } | { blocked: true };

async function fetchChecked(url: string, timeoutMs: number, headers: Record<string, string> = {}): Promise<Fetched> {
  if (timeoutMs <= 0) return { blocked: true };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json', ...headers },
    });
    if (!response.ok) return { blocked: true };
    return { blocked: false, body: await response.json().catch(() => null) };
  } catch {
    return { blocked: true };
  } finally {
    clearTimeout(timer);
  }
}

/** GET a JSON document, or null on timeout, network error, bad status or bad JSON. */
export async function fetchJson(url: string, timeoutMs: number, headers?: Record<string, string>): Promise<unknown> {
  const fetched = await fetchChecked(url, timeoutMs, headers);
  return fetched.blocked ? null : fetched.body;
}

/**
 * What one source said: a URL, `none` (it answered, and has no preview for this
 * song) or `blocked` (throttled, refused or timed out). The difference matters:
 * after `none` the next candidate is worth a try, after `blocked` more requests
 * only make a throttle worse.
 */
type Lookup = string | 'none' | 'blocked';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const httpUrl = (value: unknown): string | null =>
  typeof value === 'string' && /^https?:\/\//.test(value) ? value : null;

/**
 * Deezer answers errors (unknown track, quota exceeded) with HTTP 200 and an
 * `error` object, and tracks without a preview with an empty string.
 */
async function deezerPreview(deezerId: number, timeoutMs: number): Promise<Lookup> {
  const fetched = await fetchChecked(`https://api.deezer.com/track/${deezerId}`, timeoutMs);
  if (fetched.blocked) return 'blocked';
  const body = fetched.body;
  if (!isRecord(body) || body.error) return 'none';
  return httpUrl(body.preview) ?? 'none';
}

/** Lower case, no accents, no "(feat. …)" or "- Remastered" decorations, no punctuation. */
export function normalizeForMatch(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[([].*?[)\]]/g, ' ')
    .replace(/\s-\s.*$/, ' ')
    .replace(/\b(feat|ft|featuring)\b.*$/, ' ')
    .replace(/['’`]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const overlaps = (a: string, b: string) => a.length > 0 && b.length > 0 && (a.includes(b) || b.includes(a));

const VERSION_WORDS =
  /\b(remix|rmx|live|acoustic|demo|instrumental|karaoke|cover|rework|reprise|orchestral|unplugged|sped up|slowed|a cappella|acapella)\b/g;

/**
 * Words that make a recording a different performance, with a different tempo
 * or feel: "remix", "live", "acoustic". Decorations such as "Remastered" or
 * "Radio Edit" are not among them.
 */
export function versionWords(title: string): string {
  return [...new Set(title.toLowerCase().match(VERSION_WORDS) ?? [])].sort().join(' ');
}

/** The title as a search phrase: decorations kept as plain words, punctuation dropped. */
const searchWords = (text: string) =>
  text
    .replace(/['’`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/**
 * An iTunes preview for the same recording. The artist and the base
 * title must match, and so must the kind of version: the song was labeled from
 * one recording, and a live take or a remix would not fit its BPM.
 */
async function itunesPreview(artist: string, title: string, timeoutMs: number): Promise<Lookup> {
  const wantArtist = normalizeForMatch(artist);
  const wantTitle = normalizeForMatch(title);
  if (!wantArtist || !wantTitle) return 'none';
  const wantVersion = versionWords(title);
  // Search for the plain song, or for the exact version when it is a special one.
  const term = encodeURIComponent(wantVersion ? searchWords(`${artist} ${title}`) : `${wantArtist} ${wantTitle}`);
  const fetched = await fetchChecked(
    `https://itunes.apple.com/search?term=${term}&entity=song&limit=${TUNING.preview.itunesLimit}`,
    timeoutMs,
  );
  if (fetched.blocked) return 'blocked';
  const body = fetched.body;
  if (!isRecord(body) || !Array.isArray(body.results)) return 'none';
  for (const result of body.results) {
    if (!isRecord(result)) continue;
    const url = httpUrl(result.previewUrl);
    if (!url || typeof result.artistName !== 'string' || typeof result.trackName !== 'string') continue;
    if (!overlaps(normalizeForMatch(result.artistName), wantArtist)) continue;
    if (normalizeForMatch(result.trackName) !== wantTitle) continue;
    if (versionWords(result.trackName) !== wantVersion) continue;
    return url;
  }
  return 'none';
}

/** The preview of one exact iTunes track. */
async function itunesPreviewById(itunesTrackId: number, timeoutMs: number): Promise<Lookup> {
  const fetched = await fetchChecked(`https://itunes.apple.com/lookup?id=${itunesTrackId}`, timeoutMs);
  if (fetched.blocked) return 'blocked';
  const body = fetched.body;
  if (!isRecord(body) || !Array.isArray(body.results)) return 'none';
  const result: unknown = body.results[0];
  return (isRecord(result) ? httpUrl(result.previewUrl) : null) ?? 'none';
}

export type PreviewResult = {
  preview: Preview | null;
  /**
   * True when iTunes refused, failed or timed out (or the time budget ran out).
   * The caller should stop asking for other songs: it would only feed a throttle.
   */
  blocked: boolean;
};

/**
 * A fresh preview URL from the sources in `TUNING.preview.sources`, in order,
 * with no request running past `deadline` (a Date.now() value).
 *
 * iTunes is asked once per song: by track id when the library has one, and by
 * artist and title only when it does not. A song with an id is never searched for.
 */
export async function freshPreview(song: PreviewLookup, deadline: number): Promise<PreviewResult> {
  let blocked = false;
  for (const source of TUNING.preview.sources) {
    const timeoutMs = Math.min(TUNING.preview.timeoutMs, deadline - Date.now());
    if (timeoutMs <= 0) return { preview: null, blocked: true };
    let found: Lookup;
    if (source === 'deezer') {
      // Deezer refusing Convex is the normal state of things, not a throttle to back off from.
      found = await deezerPreview(song.deezerId, timeoutMs);
    } else {
      found =
        song.itunesTrackId === undefined
          ? await itunesPreview(song.artist, song.title, timeoutMs)
          : await itunesPreviewById(song.itunesTrackId, timeoutMs);
      if (found === 'blocked') blocked = true;
    }
    if (found !== 'none' && found !== 'blocked') return { preview: { url: found, source }, blocked: false };
  }
  return { preview: null, blocked };
}
