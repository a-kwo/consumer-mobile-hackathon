import type { ComponentRef, RefObject } from 'react';
import type { View } from 'react-native';

export const SHARE_IMAGE = { width: 1080, height: 1920 } as const;

/**
 * The web build has no image capture (it would need html2canvas, which this
 * project does not ship), so sharing reports itself as unavailable there.
 */
export async function captureCard(_card: RefObject<ComponentRef<typeof View> | null>): Promise<string> {
  throw new Error('Saving the card as an image is not supported in the browser.');
}
