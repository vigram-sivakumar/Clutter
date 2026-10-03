import { VaultPath } from '../ingest/VaultPath';
import { classifySupportedResourceFile } from '../ingest/SupportedResourceKind';
import { ASSETS_DIRECTORY_NAME } from '../initialize/ensureAssetsDirectory';
import type { VaultFileSystem } from '../providers/VaultFileSystem';
import { resolveAssetDestination } from './importAsset';

/** What fetching a remote asset yields: its bytes, and the server's declared content type when it gave one. */
export interface FetchedRemoteAsset {
  readonly bytes: Uint8Array;
  readonly contentType?: string | null;
}

export type FetchRemoteAsset = (url: string) => Promise<FetchedRemoteAsset>;

/** The largest remote asset Save to vault will write. */
export const MAX_REMOTE_ASSET_BYTES = 50 * 1024 * 1024;

/** The saved copy of a remote asset. */
export interface ImportedRemoteAsset {
  /** Vault-relative (`Assets/<filename>`) — what a cover or a Markdown image stores. */
  readonly reference: string;
  readonly absolutePath: string;
  /** True when this URL had already been saved, so nothing was downloaded or written. */
  readonly reused: boolean;
}

const EXTENSION_BY_CONTENT_TYPE: Readonly<Record<string, string>> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'application/pdf': '.pdf',
};

/** Generic binary types a server may send for a real image; trusted only with a supported extension in the URL. */
const GENERIC_BINARY_TYPES: ReadonlySet<string> = new Set(['application/octet-stream', 'binary/octet-stream']);

const MAX_STEM_LENGTH = 80;

/**
 * The file name stem a URL suggests, made safe for any filesystem and for the
 * Assets folder: the last path segment (the query and fragment are never part
 * of it), decoded, its extension dropped, reduced to letters, digits, `-`, `_`
 * and `.`, with no leading dots and a bounded length. `image` when nothing
 * usable is left. Never contains a path separator, so a remote name can't
 * escape `Assets/`.
 */
export function remoteAssetStem(url: string): string {
  let segment = '';

  try {
    const last = new URL(url).pathname.split('/').filter(Boolean).pop() ?? '';
    segment = decodeURIComponent(last);
  } catch {
    segment = '';
  }

  const dot = segment.lastIndexOf('.');
  const stem = dot > 0 ? segment.slice(0, dot) : segment;
  const safe = stem
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/\.{2,}/g, '.')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, MAX_STEM_LENGTH);

  return safe || 'image';
}

/** FNV-1a (32-bit) of the whole URL, as 8 hex digits — a stable, filesystem-safe fingerprint of which URL a file came from. */
export function remoteAssetUrlHash(url: string): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < url.length; index += 1) {
    hash ^= url.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash.toString(16).padStart(8, '0');
}

/** The URL path's own extension when it is a supported one (`.jpg`), else undefined. */
function urlExtension(url: string): string | undefined {
  try {
    const extension = VaultPath.extension(new URL(url).pathname);
    return classifySupportedResourceFile(`x${extension}`) === null ? undefined : extension;
  } catch {
    return undefined;
  }
}

/**
 * Decides the saved file's extension from what the server actually sent,
 * refusing anything that isn't a supported image/PDF. The content type wins
 * over the URL's extension when it names a supported type; a generic binary
 * type (or none) falls back to a supported URL extension; an HTML/JSON/other
 * response is refused even if the URL ends in `.jpg`.
 */
function resolveExtension(url: string, contentType: string | null | undefined): string {
  const type = contentType?.split(';')[0]?.trim().toLowerCase();
  const fromUrl = urlExtension(url);

  if (type && EXTENSION_BY_CONTENT_TYPE[type]) {
    return EXTENSION_BY_CONTENT_TYPE[type]!;
  }

  if ((!type || GENERIC_BINARY_TYPES.has(type)) && fromUrl) {
    return fromUrl;
  }

  throw new Error(
    type
      ? `Not a supported image or PDF (the server sent ${type}): ${url}`
      : `Not a supported image or PDF: ${url}`
  );
}

/**
 * Saves a remote asset into `{vaultRoot}/Assets/` and returns where it went —
 * the remote counterpart of `importAsset`, which copies a local file.
 *
 * The file name is `<stem>-<hash>.<ext>`: the stem comes from the URL's path
 * (sanitized, see `remoteAssetStem`), the hash fingerprints the *whole* URL,
 * and the extension comes from the response (`resolveExtension`). So the same
 * URL always lands on the same file — saving it again reuses that file without
 * downloading anything — while two URLs that only share a file name never
 * collide. A name taken by something else still falls back to the usual
 * collision-free suffix.
 *
 * The response is validated before anything is written: it must be a
 * supported type, non-empty, and at most `MAX_REMOTE_ASSET_BYTES`; otherwise
 * this throws and the vault is untouched.
 *
 * Non-Gate write, for the same reason `importAsset` is: an asset file never
 * becomes a Page/Folder in the Vault domain model. Fetching is injected
 * (`fetchRemoteAsset`) so this stays platform-free.
 */
export async function importRemoteAsset(
  fileSystem: VaultFileSystem,
  vaultRoot: string,
  url: string,
  fetchRemoteAsset: FetchRemoteAsset
): Promise<ImportedRemoteAsset> {
  if (!fileSystem.writeBinaryFile) {
    throw new Error('This vault cannot save remote files.');
  }

  const prefix = `${remoteAssetStem(url)}-${remoteAssetUrlHash(url)}`;
  const assetsDir = `${vaultRoot}/${ASSETS_DIRECTORY_NAME}`;

  if (await fileSystem.exists(assetsDir)) {
    const existing = (await fileSystem.readDirectory(assetsDir)).find(
      (entry) => !entry.isDirectory && entry.name.startsWith(`${prefix}.`)
    );

    if (existing) {
      return {
        reference: `${ASSETS_DIRECTORY_NAME}/${existing.name}`,
        absolutePath: `${assetsDir}/${existing.name}`,
        reused: true,
      };
    }
  }

  const { bytes, contentType } = await fetchRemoteAsset(url);

  if (bytes.byteLength === 0) {
    throw new Error(`The download was empty: ${url}`);
  }

  if (bytes.byteLength > MAX_REMOTE_ASSET_BYTES) {
    throw new Error(`The file is too large to save (over ${MAX_REMOTE_ASSET_BYTES / (1024 * 1024)} MB): ${url}`);
  }

  const extension = resolveExtension(url, contentType);
  const { destinationAbsolutePath, reference } = await resolveAssetDestination(
    fileSystem,
    vaultRoot,
    `${prefix}${extension}`
  );

  await fileSystem.writeBinaryFile(destinationAbsolutePath, bytes);

  return { reference, absolutePath: destinationAbsolutePath, reused: false };
}
