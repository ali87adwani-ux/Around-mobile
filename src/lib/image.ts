/** Shrinks and re-encodes a picked photo to JPEG before upload (iPhone photos are large and often HEIC). */
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

export async function prepareImage(uri: string, maxWidth = 1280): Promise<string> {
  try {
    const r = await manipulateAsync(uri, [{ resize: { width: maxWidth } }], { compress: 0.72, format: SaveFormat.JPEG });
    return r.uri;
  } catch {
    return uri; // fall back to the original if the device cannot convert it
  }
}
