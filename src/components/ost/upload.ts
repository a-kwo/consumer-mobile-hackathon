import { File } from 'expo-file-system';
import { fetch } from 'expo/fetch';

/** Posts a local JPEG to a Convex upload URL and returns the storage id Convex answers with. */
export async function uploadJpeg(uploadUrl: string, uri: string): Promise<string> {
  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'image/jpeg' },
    body: new File(uri),
  });
  if (!response.ok) throw new Error(`Upload failed with status ${response.status}.`);
  const { storageId } = (await response.json()) as { storageId?: unknown };
  if (typeof storageId !== 'string' || !storageId) throw new Error('The upload returned no storage id.');
  return storageId;
}
