/**
 * Album ink: the one accent colour on screen, taken from the playing song's
 * cover and tamed so it sits on paper (plan 5, "Album ink").
 *
 *   import { albumInk, INK_MUTED } from '@/lib/album-ink';
 *
 *   const ink = albumInk(track.coverColor, INK_MUTED);   // '#A38829'
 *
 * The raw cover colour is converted to HSL, then:
 *   - saturation = min(saturation, 0.60)
 *   - lightness  = clamp(lightness, 0.30, 0.40)
 *   - hue unchanged
 *
 * A missing, malformed or near-grey colour returns `fallback` unchanged (the
 * caller passes the muted ink, `#6F655C`). Album ink is for graphics only
 * (grains, wash, progress fill), never for text.
 *
 * Pure functions: no React, no native imports. Safe to run in Node.
 */

/** The muted ink token, the fallback when a cover has no usable colour. */
export const INK_MUTED = '#6F655C';

/** Album ink never gets more saturated than this. */
export const INK_MAX_SATURATION = 0.6;
/** Album ink lightness is held inside this band. */
export const INK_MIN_LIGHTNESS = 0.3;
export const INK_MAX_LIGHTNESS = 0.4;
/** Below this saturation a cover colour counts as grey and has no usable hue. */
export const INK_GREY_SATURATION = 0.08;
/** Outside this lightness band a colour is so close to black or white that its hue is noise. */
const USABLE_MIN_LIGHTNESS = 0.03;
const USABLE_MAX_LIGHTNESS = 0.97;

export type Rgb = { r: number; g: number; b: number };
/** Hue in degrees 0 to 360, saturation and lightness 0 to 1. */
export type Hsl = { h: number; s: number; l: number };

/** Parses `#RGB`, `#RRGGBB` or `#RRGGBBAA` (the `#` is optional). Channels are 0 to 255. */
export function hexToRgb(hex: string | null | undefined): Rgb | null {
  if (typeof hex !== 'string') return null;
  let body = hex.trim();
  if (body.startsWith('#')) body = body.slice(1);
  if (!/^[0-9a-fA-F]+$/.test(body)) return null;
  if (body.length === 3) {
    body = body[0] + body[0] + body[1] + body[1] + body[2] + body[2];
  } else if (body.length === 8) {
    body = body.slice(0, 6);
  } else if (body.length !== 6) {
    return null;
  }
  return {
    r: parseInt(body.slice(0, 2), 16),
    g: parseInt(body.slice(2, 4), 16),
    b: parseInt(body.slice(4, 6), 16),
  };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const part = (value: number) =>
    Math.min(255, Math.max(0, Math.round(value)))
      .toString(16)
      .padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`.toUpperCase();
}

export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  const l = (max + min) / 2;
  if (delta === 0) return { h: 0, s: 0, l };

  const s = delta / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === rn) h = ((gn - bn) / delta) % 6;
  else if (max === gn) h = (bn - rn) / delta + 2;
  else h = (rn - gn) / delta + 4;
  h *= 60;
  if (h < 0) h += 360;
  return { h, s: Math.min(1, s), l };
}

export function hslToRgb({ h, s, l }: Hsl): Rgb {
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const sector = (((h % 360) + 360) % 360) / 60;
  const x = chroma * (1 - Math.abs((sector % 2) - 1));
  let rgb: [number, number, number];
  if (sector < 1) rgb = [chroma, x, 0];
  else if (sector < 2) rgb = [x, chroma, 0];
  else if (sector < 3) rgb = [0, chroma, x];
  else if (sector < 4) rgb = [0, x, chroma];
  else if (sector < 5) rgb = [x, 0, chroma];
  else rgb = [chroma, 0, x];
  const m = l - chroma / 2;
  return { r: (rgb[0] + m) * 255, g: (rgb[1] + m) * 255, b: (rgb[2] + m) * 255 };
}

export function hexToHsl(hex: string | null | undefined): Hsl | null {
  const rgb = hexToRgb(hex);
  return rgb ? rgbToHsl(rgb) : null;
}

export function hslToHex(hsl: Hsl): string {
  return rgbToHex(hslToRgb(hsl));
}

/** The clamp itself: saturation capped, lightness held in the band, hue untouched. */
export function clampToInk({ h, s, l }: Hsl): Hsl {
  return {
    h,
    s: Math.min(s, INK_MAX_SATURATION),
    l: Math.min(INK_MAX_LIGHTNESS, Math.max(INK_MIN_LIGHTNESS, l)),
  };
}

/** True when a colour has a hue worth keeping (not grey, not black, not white). */
export function hasUsableHue({ s, l }: Hsl): boolean {
  return s >= INK_GREY_SATURATION && l >= USABLE_MIN_LIGHTNESS && l <= USABLE_MAX_LIGHTNESS;
}

/**
 * Raw cover colour to album ink.
 *
 * @param coverColor Hex from the backend (`songs.coverColor`). May be missing.
 * @param fallback   Returned as is when there is no usable colour. Pass the muted ink.
 */
export function albumInk(coverColor: string | null | undefined, fallback: string): string {
  const hsl = hexToHsl(coverColor);
  if (!hsl || !hasUsableHue(hsl)) return fallback;
  return hslToHex(clampToInk(hsl));
}

/** `rgba(r, g, b, alpha)` for a hex colour, for gradients that fade a colour out. */
export function hexWithAlpha(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex) ?? { r: 0, g: 0, b: 0 };
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}
