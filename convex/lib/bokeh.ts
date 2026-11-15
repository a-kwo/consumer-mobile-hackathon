/**
 * A procedural stand-in for a photo: out-of-focus lights over a two-colour
 * sky, drawn in code and encoded as a PNG. The seeded friends use it as their
 * lead image, so the photo layout shows on a device with an empty camera
 * roll, with no binary asset in the repo and nothing hotlinked. Pure and
 * deterministic: the same seed always gives the same bytes.
 */
import { seededRandom } from './hash';

type Rgb = readonly [number, number, number];

export type BokehPalette = {
  /** The sky at the top and at the bottom of the frame. */
  top: Rgb;
  bottom: Rgb;
  /** The colours of the lights. */
  lights: readonly Rgb[];
  /** How many lights. */
  count: number;
};

export const BOKEH_PALETTES = {
  /** Wet streets after dark: tail lights, signals and shop windows. */
  rainyNight: {
    top: [8, 10, 24],
    bottom: [30, 18, 40],
    lights: [
      [255, 176, 72],
      [255, 92, 80],
      [88, 210, 196],
      [250, 236, 200],
    ],
    count: 46,
  },
  /** First light over the park: a warm horizon under a blue sky. */
  sunrise: {
    top: [44, 62, 110],
    bottom: [246, 164, 92],
    lights: [
      [255, 226, 170],
      [255, 198, 128],
      [255, 244, 222],
    ],
    count: 30,
  },
} as const satisfies Record<string, BokehPalette>;

export type BokehPaletteName = keyof typeof BOKEH_PALETTES;

/** RGB pixels, row by row, three bytes each. */
export function bokehPixels(seed: number, palette: BokehPalette, width: number, height: number): Uint8Array {
  const random = seededRandom(seed);
  const light = new Float32Array(width * height * 3);
  for (let index = 0; index < palette.count; index++) {
    const [r, g, b] = palette.lights[Math.floor(random() * palette.lights.length)];
    const radius = height * (0.04 + random() * 0.11);
    const cx = random() * width;
    // Lights gather in the lower two thirds, like a street seen from the pavement.
    const cy = height * (0.3 + random() * 0.7);
    const strength = 0.16 + random() * 0.3;
    const x0 = Math.max(0, Math.floor(cx - radius));
    const x1 = Math.min(width - 1, Math.ceil(cx + radius));
    const y0 = Math.max(0, Math.floor(cy - radius));
    const y1 = Math.min(height - 1, Math.ceil(cy + radius));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const distance = Math.hypot(x - cx, y - cy) / radius;
        if (distance >= 1) continue;
        // A flat disc with a slightly brighter rim and a soft edge, as a lens draws a point of light.
        const alpha = strength * (0.8 + 0.2 * distance) * Math.min(1, (1 - distance) * 6);
        const at = (y * width + x) * 3;
        light[at] += r * alpha;
        light[at + 1] += g * alpha;
        light[at + 2] += b * alpha;
      }
    }
  }

  const pixels = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    const t = y / (height - 1);
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 3;
      // A little grain keeps the uncompressed gradient from banding.
      const grain = (random() - 0.5) * 6;
      for (let channel = 0; channel < 3; channel++) {
        const sky = palette.top[channel] + (palette.bottom[channel] - palette.top[channel]) * t;
        pixels[at + channel] = Math.max(0, Math.min(255, Math.round(sky + light[at + channel] + grain)));
      }
    }
  }
  return pixels;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let index = 0; index < 4; index++) out[4 + index] = type.charCodeAt(index);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** A zlib stream of stored (uncompressed) blocks: valid everywhere and needs no deflate implementation. */
function zlibStored(data: Uint8Array): Uint8Array {
  const BLOCK = 65535;
  const blocks = Math.max(1, Math.ceil(data.length / BLOCK));
  const out = new Uint8Array(2 + data.length + blocks * 5 + 4);
  const view = new DataView(out.buffer);
  out[0] = 0x78;
  out[1] = 0x01;
  let at = 2;
  let a = 1;
  let b = 0;
  for (let block = 0; block < blocks; block++) {
    const part = data.subarray(block * BLOCK, (block + 1) * BLOCK);
    out[at] = block === blocks - 1 ? 1 : 0;
    view.setUint16(at + 1, part.length, true);
    view.setUint16(at + 3, ~part.length & 0xffff, true);
    out.set(part, at + 5);
    at += 5 + part.length;
    for (const byte of part) {
      a = (a + byte) % 65521;
      b = (b + a) % 65521;
    }
  }
  view.setUint32(at, ((b << 16) | a) >>> 0);
  return out;
}

/** Encodes RGB pixels as an 8-bit truecolour PNG. */
export function encodePng(pixels: Uint8Array, width: number, height: number): Uint8Array {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header[8] = 8;
  header[9] = 2;

  // Each row is prefixed with its filter type; 0 is "none".
  const row = width * 3;
  const raw = new Uint8Array((row + 1) * height);
  for (let y = 0; y < height; y++) raw.set(pixels.subarray(y * row, (y + 1) * row), y * (row + 1) + 1);

  const parts = [
    Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
    chunk('IHDR', header),
    chunk('IDAT', zlibStored(raw)),
    chunk('IEND', new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** A finished bokeh image as PNG bytes. */
export function bokehPng(seed: number, palette: BokehPalette, width: number, height: number): Uint8Array {
  return encodePng(bokehPixels(seed, palette, width, height), width, height);
}
