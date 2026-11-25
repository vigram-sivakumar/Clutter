import { isTauri } from '@tauri-apps/api/core';
import { exportWriteBytes, pickExportDestination } from './nativeExport';
import { downloadRemoteBytes } from './downloadRemoteBytes';

const MAX_REMOTE_IMAGE_EXPORT_BYTES = 50 * 1024 * 1024;

/**
 * Best-effort filename suggestion for the Save dialog, taken from the
 * URL's own last path segment (e.g. `.../photo.png` -> `photo.png`) —
 * falls back to `image` for a URL with no usable segment (query-only,
 * trailing slash, or an unparsable string).
 */
function suggestedFileNameFromUrl(url: string): string {
  try {
    const { pathname } = new URL(url);
    const last = pathname.split('/').filter(Boolean).pop();
    return last ? decodeURIComponent(last) : 'image';
  } catch {
    return 'image';
  }
}

/**
 * Exports a copy of an externally-hosted image (no local `VaultResource`
 * behind it — see `imageResourceResolution.ts`) to a user-chosen
 * destination via the native Save dialog — the fetch-based counterpart to
 * `downloadResource.ts`'s local copy, needed because there's no
 * source file on disk to copy from. No-op in the web runtime, mirroring
 * `downloadResource.ts`'s own `isTauri()` guard. Resolves true only when the
 * file was written (false: web runtime or the dialog was cancelled), so a caller can
 * report the download to Unsplash only when it really happened.
 */
export async function downloadRemoteImage(url: string): Promise<boolean> {
  if (!isTauri()) {
    return false;
  }

  const destination = await pickExportDestination(suggestedFileNameFromUrl(url));
  if (!destination) {
    return false;
  }

  const { bytes } = await downloadRemoteBytes(url, MAX_REMOTE_IMAGE_EXPORT_BYTES);
  await exportWriteBytes(destination, bytes);

  return true;
}
