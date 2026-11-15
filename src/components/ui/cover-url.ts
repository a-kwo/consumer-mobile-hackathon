import { PixelRatio } from 'react-native';

/** Square sizes the Deezer image CDN serves, in pixels. */
const DEEZER_SIZES = [56, 250, 500, 1000] as const;

/** Matches the size segment of a Deezer cover URL: `/1000x1000-000000-80-0-0.jpg`. */
const DEEZER_SIZE_SEGMENT = /\/\d+x\d+-/;

/**
 * Returns the cover URL best suited to being drawn at `points` wide.
 *
 * Deezer cover URLs carry their size in the path, so a 48 pt list thumbnail
 * can fetch the 250 px file instead of the 1000 px one. URLs from any other
 * host are returned unchanged. `CoverArt`, `CoverMosaic` and
 * `AmbientBackground` already call this; screens can pass the URL they were
 * given straight through.
 */
export function coverUrlAtSize(url: string | null | undefined, points: number): string | null {
  if (!url) return null;
  if (!url.includes('dzcdn.net') || !DEEZER_SIZE_SEGMENT.test(url)) return url;
  const pixels = points * Math.min(PixelRatio.get(), 3);
  const size = DEEZER_SIZES.find((candidate) => candidate >= pixels) ?? 1000;
  return url.replace(DEEZER_SIZE_SEGMENT, `/${size}x${size}-`);
}
