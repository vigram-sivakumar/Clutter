import { isTauri } from '@tauri-apps/api/core';
import { readFile } from '@tauri-apps/plugin-fs';

import { fetchRemoteAsset } from '@core/vault/providers/fetchRemoteAsset';
import type { ImageBytes } from '@shared/helpers/copyImageToClipboard';
import { isRemoteImageReference } from './page/ImageFileActionsContext';

/**
 * The bytes of a cover image for "Copy image". `reference` is what the cover is stored as: an http(s) URL — fetched
 * the way a download is (through Tauri's HTTP plugin in the desktop app, which has no CORS limit; with a timeout and
 * size limit) — or a vault-relative path, read from the file in the vault (in the desktop app) or from the address the
 * page displays it with (the web runtime, which has no file access). The stored reference is never changed.
 */
export async function loadCoverImageBytes(
  reference: string,
  vault: { readonly root: string; readonly loadableUrl: (absolutePath: string) => string }
): Promise<ImageBytes> {
  if (isRemoteImageReference(reference)) {
    return fetchRemoteAsset(reference);
  }

  const absolutePath = `${vault.root}/${reference}`;

  if (isTauri()) {
    return { bytes: await readFile(absolutePath) };
  }

  const response = await fetch(vault.loadableUrl(absolutePath));

  if (!response.ok) {
    throw new Error(`Could not read ${reference} (${response.status}).`);
  }

  return { bytes: new Uint8Array(await response.arrayBuffer()) };
}
