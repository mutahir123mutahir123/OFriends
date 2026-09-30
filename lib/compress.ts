import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/** Longest-edge cap for feed posts — retina quality. */
const POST_MAX_EDGE = 1440;
/** Longest-edge cap for stories — displayed fullscreen, so keep it generous. */
const STORY_MAX_EDGE = 1080;

type Resize = { width: number | null; height: number | null };

/**
 * Builds a resize that scales the image down so its longest edge is at most
 * `maxEdge`, while preserving the original aspect ratio. Returns null when no
 * resize is needed, so we can skip the round-trip to the image decoder.
 */
function fitInside(width: number, height: number, maxEdge: number): Resize | null {
  if (!width || !height) return null;
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return null;
  const scale = maxEdge / longest;
  return width >= height
    ? { width: maxEdge, height: Math.round(height * scale) }
    : { width: Math.round(width * scale), height: maxEdge };
}

async function resizeAndSave(
  uri: string,
  resize: Resize | null,
  compress: number,
): Promise<string> {
  if (!resize) return uri;

  const context = ImageManipulator.manipulate(uri);
  context.resize({ width: resize.width, height: resize.height });
  const rendered = await context.renderAsync();
  const result = await rendered.saveAsync({ compress, format: SaveFormat.JPEG });
  return result.uri;
}

/**
 * Compresses a post image to a target size.
 * - Scales the longest edge down to 1440px (preserves aspect ratio)
 * - Re-encodes as JPEG at 92% quality
 */
export async function compressImage(uri: string, width?: number, height?: number): Promise<string> {
  return resizeAndSave(uri, fitInside(width ?? 0, height ?? 0, POST_MAX_EDGE), 0.92);
}

/**
 * Compresses a story image to a target size.
 *
 * Stories are displayed with `contentFit="contain"`, so nothing is cropped and
 * the full photo is always visible. The cap is therefore applied to the LONGEST
 * edge rather than the width — a tall 9:16 phone photo scaled to 1080 wide would
 * come out ~1920 tall and pointlessly heavy.
 */
export async function compressStoryImage(
  uri: string,
  width?: number,
  height?: number,
): Promise<string> {
  return resizeAndSave(uri, fitInside(width ?? 0, height ?? 0, STORY_MAX_EDGE), 0.9);
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
