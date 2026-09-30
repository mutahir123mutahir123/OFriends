import * as ImageManipulator from 'expo-image-manipulator';

/**
 * Compresses an image to a target size.
 * - Resizes to max 1080px on the longest side (preserves aspect ratio)
 * - Re-encodes as JPEG at 75% quality
 * - Typical result: 4MB photo → ~200–400 KB
 */
export async function compressImage(uri: string): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1440 } }],   // resize to 1440px wide — retina quality
    {
      compress: 0.92,                  // 92% JPEG — near-lossless, visually original
      format: ImageManipulator.SaveFormat.JPEG,
    }
  );
  return result.uri;
}

/**
 * Compresses a story image — full-screen display so keep quality high.
 */
export async function compressStoryImage(uri: string): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1080 } }],
    {
      compress: 0.90,                  // 90% JPEG — high quality for stories
      format: ImageManipulator.SaveFormat.JPEG,
    }
  );
  return result.uri;
}

/**
 * Human-readable file size string.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Converts a local URI to a Blob for uploading.
 */
export async function uriToBlob(uri: string): Promise<{ blob: Blob }> {
  const response = await fetch(uri);
  const blob = await response.blob();
  return { blob };
}
