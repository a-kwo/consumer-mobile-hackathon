import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { TUNING } from '../../../convex/tuning';

export type PickedPhoto = {
  /** A local JPEG, resized for upload. */
  uri: string;
  /** When the camera says the photo was taken, when it says so at all. */
  takenAt: number | null;
};

/** EXIF writes local time as "2026:11:15 18:12:03". */
function parseExifDate(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
  const ms = new Date(year, month - 1, day, hour, minute, second).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Opens the system photo picker for one image and returns it as a JPEG no
 * larger than `photoLongSidePx` on its long side. Null when the user backs
 * out. The system picker needs no photo-library permission.
 */
export async function pickPhoto(): Promise<PickedPhoto | null> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], exif: true, quality: 1 });
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;

  // Decoding to at most the target size on both sides keeps the aspect ratio
  // and never loads a full-resolution camera photo into memory.
  const { photoLongSidePx, photoJpegQuality } = TUNING.share;
  const context = ImageManipulator.manipulate(asset.uri, { maxWidth: photoLongSidePx, maxHeight: photoLongSidePx });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: photoJpegQuality });

  return { uri: saved.uri, takenAt: parseExifDate(asset.exif?.DateTimeOriginal ?? asset.exif?.DateTime) };
}
