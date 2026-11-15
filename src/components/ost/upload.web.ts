/** The browser has no file system module: the picked image is a blob URL, read and posted with the page's own fetch. */
export async function uploadJpeg(uploadUrl: string, uri: string): Promise<string> {
  const blob = await (await fetch(uri)).blob();
  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'image/jpeg' },
    body: blob,
  });
  if (!response.ok) throw new Error(`Upload failed with status ${response.status}.`);
  const { storageId } = (await response.json()) as { storageId?: unknown };
  if (typeof storageId !== 'string' || !storageId) throw new Error('The upload returned no storage id.');
  return storageId;
}
