import { VaultPath } from '../ingest/VaultPath';
import { classifySupportedResourceFile } from '../ingest/SupportedResourceKind';
import type { VaultFileSystem } from '../providers/VaultFileSystem';
import { resolveAssetDestination } from './importAsset';

/** What fetching a remote asset yields: its bytes, and the server's declared content type when it gave one. */
export interface FetchedRemoteAsset {
  readonly bytes: Uint8Array;
  readonly contentType?: string | null;
}

export type FetchRemoteAsset = (url: string) => Promise<FetchedRemoteAsset>;

const EXTENSION_BY_CONTENT_TYPE: Readonly<Record<string, string>> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'application/pdf': '.pdf',
};

/** The file name a URL suggests: its last path segment (`…/photo.png` -> `photo.png`), decoded; `image` when there is none. */
function fileNameFromUrl(url: string): string {
  try {
    const last = new URL(url).pathname.split('/').filter(Boolean).pop();
    return last ? decodeURIComponent(last) : 'image';
  } catch {
    return 'image';
  }
}

/**
 * Saves a remote asset into `{vaultRoot}/Assets/` and returns the
 * vault-relative reference (`Assets/<filename>`) — the remote counterpart of
 * `importAsset`, which copies a local file. The name comes from the URL, gets
 * a supported extension from the server's content type when the URL has none,
 * and is made collision-free by the same `resolveAssetDestination`.
 *
 * Non-Gate write, for the same reason `importAsset` is: an asset file never
 * becomes a Page/Folder in the Vault domain model. The new file is picked up
 * by the vault's normal file watching, like any asset dropped into the vault.
 * Fetching is injected (`fetchRemoteAsset`) so this stays platform-free.
 *
 * Throws when the file system can't write binary data, or when the response
 * isn't a supported asset (no usable extension and no recognized content type).
 */
export async function importRemoteAsset(
  fileSystem: VaultFileSystem,
  vaultRoot: string,
  url: string,
  fetchRemoteAsset: FetchRemoteAsset
): Promise<string> {
  if (!fileSystem.writeBinaryFile) {
    throw new Error('This vault cannot save remote files.');
  }

  const { bytes, contentType } = await fetchRemoteAsset(url);

  let fileName = fileNameFromUrl(url);

  if (classifySupportedResourceFile(fileName) === null) {
    const type = contentType?.split(';')[0]?.trim().toLowerCase();
    const extension = type ? EXTENSION_BY_CONTENT_TYPE[type] : undefined;

    if (!extension) {
      throw new Error(`Not a supported image or PDF: ${url}`);
    }

    // `name.jpeg?x` and friends were handled by the URL parse; here the name has
    // no (supported) extension, so the content type's is appended.
    fileName = `${VaultPath.stemName(fileName)}${extension}`;
  }

  const { destinationAbsolutePath, reference } = await resolveAssetDestination(
    fileSystem,
    vaultRoot,
    fileName
  );

  await fileSystem.writeBinaryFile(destinationAbsolutePath, bytes);

  return reference;
}
