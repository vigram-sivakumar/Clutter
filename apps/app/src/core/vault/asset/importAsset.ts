import { resolveCollisionFreeName } from '../../shared/naming/resolveCollisionFreeName';
import { VaultPath } from '../ingest/VaultPath';
import { classifySupportedResourceFile } from '../ingest/SupportedResourceKind';
import { ASSETS_DIRECTORY_NAME, ensureAssetsDirectory } from '../initialize/ensureAssetsDirectory';
import { retryDestinationCollision, type VaultFileSystem } from '../providers/VaultFileSystem';

/**
 * Copies an external file into `{vaultRoot}/Assets/` and returns the
 * vault-relative reference (`Assets/<filename>`). The generic form of what
 * was previously `importCoverAsset`'s own body — that logic never actually
 * depended on the file being a cover image (no image-only validation, no
 * cover-specific metadata), so this is an extraction, not a
 * generalization: `importCoverAsset` now delegates here unchanged.
 *
 * Non-Gate write — an asset file never becomes a `Page`/`Folder` in the
 * Vault domain model, so it falls outside what the Persistence Gate
 * governs at all (ARCHITECTURE_RULES.md rule 2's own scope clause), the
 * same reasoning `importCoverAsset` already relied on.
 */
export async function importAsset(
  fileSystem: VaultFileSystem,
  vaultRoot: string,
  sourceAbsolutePath: string,
  /** The absolute folder the file goes into — a folder inside `Assets/`. Absent: `Assets/` itself. */
  destinationFolderPath?: string
): Promise<string> {
  const { reference } = await writeToFreeAssetName(
    fileSystem,
    vaultRoot,
    VaultPath.filename(sourceAbsolutePath),
    destinationFolderPath,
    (destinationAbsolutePath) => fileSystem.copyFile(sourceAbsolutePath, destinationAbsolutePath)
  );

  return reference;
}

/**
 * Chooses a free asset name and writes there with `write`, which must never replace (`copyFile` and
 * `writeBinaryFile` refuse an existing destination with `DestinationExistsError`). The name is only free when it is
 * chosen: if another process takes it before the write lands, the write is refused, nothing is replaced, and the next
 * free name is chosen from a fresh listing. A name that keeps being taken (something `readDirectory` cannot see, such
 * as a folder of that name) ends in the refusal itself after `MAX_DESTINATION_ATTEMPTS` tries, never in a replacement.
 * Returns where the file went, as `resolveAssetDestination` names it.
 */
export async function writeToFreeAssetName(
  fileSystem: VaultFileSystem,
  vaultRoot: string,
  fileName: string,
  destinationFolderPath: string | undefined,
  write: (destinationAbsolutePath: string) => Promise<void>
): Promise<{ readonly destinationAbsolutePath: string; readonly reference: string }> {
  return serializeMediaImport(vaultRoot, () => retryDestinationCollision(async () => {
    const destination = await resolveAssetDestination(fileSystem, vaultRoot, fileName, destinationFolderPath);
    await write(destination.destinationAbsolutePath);
    return destination;
  }));
}

/**
 * Where a new asset called `fileName` goes in `{vaultRoot}/Assets/`: the
 * folder is created if needed, and the name is made collision-free (`photo`,
 * `photo 2`, …). The one place an imported asset's destination is decided —
 * shared by importing a file (`importAsset`) and saving remote bytes
 * (`importRemoteAsset`), so the two can never name things differently.
 */
export async function resolveAssetDestination(
  fileSystem: VaultFileSystem,
  vaultRoot: string,
  fileName: string,
  /** The absolute folder the file goes into — `Assets/` itself, or a folder inside it. Absent: `Assets/`. */
  destinationFolderPath?: string
): Promise<{ readonly destinationAbsolutePath: string; readonly reference: string }> {
  const defaultDir = `${vaultRoot}/${ASSETS_DIRECTORY_NAME}`;
  const assetsDir = destinationFolderPath ?? defaultDir;
  if (assetsDir === defaultDir) await ensureAssetsDirectory(fileSystem, vaultRoot);
  const dotIndex = fileName.lastIndexOf('.');
  const baseName = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
  const extension = dotIndex > 0 ? fileName.slice(dotIndex) : '';

  const entries = await fileSystem.readDirectory(assetsDir);
  // Compared ignoring case: the common file systems (macOS, Windows) would put
  // `Photo.jpg` and `photo.jpg` in the same file.
  const existingNames = new Set(entries.map((entry) => mediaNameKey(entry.name)));
  // Private infrastructure is not part of the media namespace. All user-content media is.
  if (!assetsDir.startsWith(`${vaultRoot}/.clutter/`)) {
    await collectMediaNames(fileSystem, vaultRoot, vaultRoot, existingNames);
  }

  const uniqueBaseName = resolveCollisionFreeName(baseName, (candidate) =>
    existingNames.has(mediaNameKey(`${candidate}${extension}`))
  );
  const destinationFileName = `${uniqueBaseName}${extension}`;

  return {
    destinationAbsolutePath: `${assetsDir}/${destinationFileName}`,
    // Vault-relative: `Assets/photo.png`, or `Assets/Trips/photo.png` for a folder inside it.
    reference: `${assetsDir.slice(vaultRoot.length + 1)}/${destinationFileName}`,
  };
}

/** Case-insensitive, canonically normalized comparison, including macOS decomposed names. */
export function mediaNameKey(name: string): string {
  return name.normalize('NFC').toLowerCase();
}

const importQueues = new Map<string, Promise<unknown>>();
function serializeMediaImport<T>(root: string, run: () => Promise<T>): Promise<T> {
  const previous = importQueues.get(root) ?? Promise.resolve();
  const next = previous.then(run);
  const settled = next.catch(() => undefined);
  importQueues.set(root, settled);
  void settled.then(() => { if (importQueues.get(root) === settled) importQueues.delete(root); });
  return next;
}

/** Use the same supported-resource classification as VaultScanner; no note parsing or byte reads. */
async function collectMediaNames(fileSystem: VaultFileSystem, root: string, directory: string, names: Set<string>): Promise<void> {
  for (const entry of await fileSystem.readDirectory(directory)) {
    if (entry.isDirectory) {
      if (entry.path !== `${root}/.clutter`) await collectMediaNames(fileSystem, root, entry.path, names);
    } else if (classifySupportedResourceFile(entry.name) !== null) {
      names.add(mediaNameKey(entry.name));
    }
  }
}

const EXTENSION_BY_MIME_TYPE: Readonly<Record<string, string>> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'application/pdf': '.pdf',
};

/** Whether a clipboard/file MIME type is an image or PDF Clutter stores as an asset. */
export function isSupportedAssetMimeType(mimeType: string): boolean {
  return mimeType.toLowerCase() in EXTENSION_BY_MIME_TYPE;
}

/** The file name a pasted file is stored under: its own name when that already has a supported extension, else one from its MIME type. Never contains a path separator. */
export function pastedAssetFileName(name: string, mimeType: string): string {
  const base = name.split(/[\\/]/).pop()?.trim() ?? '';
  const stem = base.replace(/\.[^.]*$/, '');
  const extension = EXTENSION_BY_MIME_TYPE[mimeType.toLowerCase()];

  // A clipboard screenshot arrives as a generic `image.png`: give it a name that says what it is.
  const displayStem = !stem || stem.toLowerCase() === 'image' ? 'Pasted image' : stem;

  if (base && classifySupportedResourceFile(base) !== null) {
    return `${displayStem}${base.slice(stem.length)}`;
  }

  if (!extension) {
    throw new Error(`Not a supported image or PDF: ${name}`);
  }

  return `${displayStem}${extension}`;
}

/**
 * Writes bytes from the clipboard into `{vaultRoot}/Assets/` (collision-free, like `importAsset`) and
 * returns the vault-relative reference. The bytes-in counterpart of `importAsset`; non-Gate for the same
 * reason (an asset file never becomes a Page/Folder).
 */
export async function importAssetBytes(
  fileSystem: VaultFileSystem,
  vaultRoot: string,
  fileName: string,
  bytes: Uint8Array,
  destinationFolderPath?: string
): Promise<string> {
  if (!fileSystem.writeBinaryFile) {
    throw new Error('This vault cannot save pasted files.');
  }

  if (bytes.byteLength === 0) {
    throw new Error(`The pasted file was empty: ${fileName}`);
  }

  const { reference } = await writeToFreeAssetName(fileSystem, vaultRoot, fileName, destinationFolderPath, (destinationAbsolutePath) =>
    fileSystem.writeBinaryFile!(destinationAbsolutePath, bytes)
  );

  return reference;
}
