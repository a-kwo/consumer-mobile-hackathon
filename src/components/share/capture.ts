import type { ComponentRef, RefObject } from 'react';
import type { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

/** Pixel size of the exported image: 9 by 16, the story format. */
export const SHARE_IMAGE = { width: 1080, height: 1920 } as const;

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/**
 * Renders the share card to a JPEG in the app's temporary directory and
 * returns its `file://` URI. Rejects when the view cannot be captured.
 */
export async function captureCard(card: RefObject<ComponentRef<typeof View> | null>): Promise<string> {
  if (!card.current) throw new Error('The card is not on screen yet.');
  // Two frames, so images that have just finished loading are drawn.
  await nextFrame();
  await nextFrame();
  const uri = await captureRef(card, {
    format: 'jpg',
    quality: 0.9,
    result: 'tmpfile',
    width: SHARE_IMAGE.width,
    height: SHARE_IMAGE.height,
  });
  return uri.startsWith('/') ? `file://${uri}` : uri;
}
