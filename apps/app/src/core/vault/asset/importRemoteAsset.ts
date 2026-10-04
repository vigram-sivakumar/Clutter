import { VaultPath } from '../ingest/VaultPath';
import { classifySupportedResourceFile } from '../ingest/SupportedResourceKind';
import { ASSETS_DIRECTORY_NAME } from '../initialize/ensureAssetsDirectory';
import type { VaultFileSystem } from '../providers/VaultFileSystem';
import { sanitizeAssetDisplayName } from './assetDisplayName';
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
 * The file name stem a URL suggests (the fallback when there is no usable
 * display text), made safe for any filesystem and for the Assets folder: the last path segment (the query and fragment are never part
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

/** Options for `importRemoteAsset`. */
export interface ImportRemoteAssetOptions {
  /**
   * What the file should be called, typically the display text the user typed in
   * `![display text](url)`. Sanitized here; one that makes no usable name (empty,
   * generic, a bare URL) falls back to the URL's own name.
   */
  readonly displayName?: string;
}

/** `Name.jpg`, `Name 2.jpg`, `Name 3.jpg`, … (any case) — the files `resolveAssetDestination` could have made for this name. */
function isSameNameFamily(entryName: string, stem: string, extension: string): boolean {
  const lower = entryName.toLowerCase();
  const base = `${stem}`.toLowerCase();
  const ext = extension.toLowerCase();

  if (!lower.endsWith(ext)) {
    return false;
  }

  const withoutExtension = lower.slice(0, lower.length - ext.length);

  return withoutExtension === base || new RegExp(`^${escapeRegExp(base)} \\d+$`).test(withoutExtension);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) {
    return false;
  }

  for (let index = 0; index < a.byteLength; index += 1) {
    if (a[index] !== b[index]) {
      return false;
    }
  }

  return true;
}

/**
 * Saves a remote asset into `{vaultRoot}/Assets/` and returns where it went —
 * the remote counterpart of `importAsset`, which copies a local file.
 *
 * Name: the display text the user typed (`options.displayName`), else the URL's
 * own file name (sanitized, see `remoteAssetStem`); the extension comes from the
 * response (`resolveExtension`). A name already taken gets the usual
 * collision-free suffix (`Name`, `Name 2`, …), compared ignoring case because
 * common file systems do.
 *
 * Reuse: after downloading, if a file in that name family is byte-identical to
 * the download, that file is returned (`reused: true`) and nothing is written,
 * so saving the same image twice never makes `Name 2`. Without a binary read
 * primitive the check is skipped and a new file is written.
 *
 * The response is validated before anything is written: supported type,
 * non-empty, at most `MAX_REMOTE_ASSET_BYTES`; otherwise this throws and the
 * vault is untouched.
 *
 * Non-Gate write, for the same reason `importAsset` is: an asset file never
 * becomes a Page/Folder in the Vault domain model. Fetching is injected
 * (`fetchRemoteAsset`) so this stays platform-free.
 */
export async function importRemoteAsset(
  fileSystem: VaultFileSystem,
  vaultRoot: string,
  url: string,
  fetchRemoteAsset: FetchRemoteAsset,
  options: ImportRemoteAssetOptions = {}
): Promise<ImportedRemoteAsset> {
  if (!fileSystem.writeBinaryFile) {
    throw new Error('This vault cannot save remote files.');
  }

  const { bytes, contentType } = await fetchRemoteAsset(url);

  if (bytes.byteLength === 0) {
    throw new Error(`The download was empty: ${url}`);
  }

  if (bytes.byteLength > MAX_REMOTE_ASSET_BYTES) {
    throw new Error(`The file is too large to save (over ${MAX_REMOTE_ASSET_BYTES / (1024 * 1024)} MB): ${url}`);
  }

  const extension = resolveExtension(url, contentType);
  const stem =
    (options.displayName ? sanitizeAssetDisplayName(options.displayName) : null) ?? remoteAssetStem(url);
  const assetsDir = `${vaultRoot}/${ASSETS_DIRECTORY_NAME}`;

  if (fileSystem.readBinaryFile && (await fileSystem.exists(assetsDir))) {
    for (const entry of await fileSystem.readDirectory(assetsDir)) {
      if (entry.isDirectory || !isSameNameFamily(entry.name, stem, extension)) {
        continue;
      }

      const existingPath = `${assetsDir}/${entry.name}`;

      if (sameBytes(await fileSystem.readBinaryFile(existingPath), bytes)) {
        return {
          reference: `${ASSETS_DIRECTORY_NAME}/${entry.name}`,
          absolutePath: existingPath,
          reused: true,
        };
      }
    }
  }

  const { destinationAbsolutePath, reference } = await resolveAssetDestination(
    fileSystem,
    vaultRoot,
    `${stem}${extension}`
  );

  await fileSystem.writeBinaryFile(destinationAbsolutePath, bytes);

  return { reference, absolutePath: destinationAbsolutePath, reused: false };
}
