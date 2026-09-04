import { isTauri } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';

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
 * `downloadResource.ts`'s local `copy_file`, needed because there's no
 * source file on disk to copy from. No-op in the web runtime, mirroring
 * `downloadResource.ts`'s own `isTauri()` guard.
 */
export async function downloadRemoteImage(url: string): Promise<void> {
  if (!isTauri()) {
    return;
  }

  const destination = await save({ defaultPath: suggestedFileNameFromUrl(url) });
  if (!destination) {
    return;
  }

  const response = await fetch(url);
  const bytes = new Uint8Array(await response.arrayBuffer());
  await writeFile(destination, bytes);
}
