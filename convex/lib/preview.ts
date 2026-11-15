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

/** GET a JSON document, or null on timeout, network error, bad status or bad JSON. */
export async function fetchJson(url: string, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const httpUrl = (value: unknown): string | null =>
  typeof value === 'string' && /^https?:\/\//.test(value) ? value : null;

/**
 * Deezer answers errors (unknown track, quota exceeded) with HTTP 200 and an
 * `error` object, and tracks without a preview with an empty string.
 */
export async function deezerPreview(deezerId: number): Promise<string | null> {
  const body = await fetchJson(`https://api.deezer.com/track/${deezerId}`, TUNING.preview.timeoutMs);
  if (!isRecord(body) || body.error) return null;
  return httpUrl(body.preview);
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
 * An iTunes preview for the same recording, or null. The artist and the base
 * title must match, and so must the kind of version: the song was labeled from
 * one recording, and a live take or a remix would not fit its BPM.
 */
export async function itunesPreview(artist: string, title: string): Promise<string | null> {
  const wantArtist = normalizeForMatch(artist);
  const wantTitle = normalizeForMatch(title);
  if (!wantArtist || !wantTitle) return null;
  const wantVersion = versionWords(title);
  // Search for the plain song, or for the exact version when it is a special one.
  const term = encodeURIComponent(wantVersion ? searchWords(`${artist} ${title}`) : `${wantArtist} ${wantTitle}`);
  const body = await fetchJson(
    `https://itunes.apple.com/search?term=${term}&entity=song&limit=${TUNING.preview.itunesLimit}`,
    TUNING.preview.timeoutMs,
  );
  if (!isRecord(body) || !Array.isArray(body.results)) return null;
  for (const result of body.results) {
    if (!isRecord(result)) continue;
    const url = httpUrl(result.previewUrl);
    if (!url || typeof result.artistName !== 'string' || typeof result.trackName !== 'string') continue;
    if (!overlaps(normalizeForMatch(result.artistName), wantArtist)) continue;
    if (normalizeForMatch(result.trackName) !== wantTitle) continue;
    if (versionWords(result.trackName) !== wantVersion) continue;
    return url;
  }
  return null;
}

/** The preview of one exact iTunes track, or null. */
export async function itunesPreviewById(itunesTrackId: number): Promise<string | null> {
  const body = await fetchJson(`https://itunes.apple.com/lookup?id=${itunesTrackId}`, TUNING.preview.timeoutMs);
  if (!isRecord(body) || !Array.isArray(body.results)) return null;
  const result: unknown = body.results[0];
  return isRecord(result) ? httpUrl(result.previewUrl) : null;
}

/**
 * A fresh preview URL from the sources in `TUNING.preview.sources`, in order.
 * iTunes is asked by track id when the library has one, else by artist and title.
 * Null when no source has a preview.
 */
export async function freshPreview(song: PreviewLookup): Promise<Preview | null> {
  for (const source of TUNING.preview.sources) {
    let url: string | null;
    if (source === 'deezer') url = await deezerPreview(song.deezerId);
    else {
      url =
        (song.itunesTrackId === undefined ? null : await itunesPreviewById(song.itunesTrackId)) ??
        (await itunesPreview(song.artist, song.title));
    }
    if (url) return { url, source };
  }
  return null;
}
