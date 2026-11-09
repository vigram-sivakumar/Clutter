import type { VaultFileSystem } from '../providers/VaultFileSystem';

const normalizeName = (name: string) => name.normalize('NFC').toLowerCase();

/**
 * Whether `absolutePath` is POSITIVELY known to be missing: its parent directory exists, was listed successfully,
 * and the listing has no entry of that name (compared case-insensitively and Unicode-normalised, so a volume that
 * folds case or normalisation can never make a present file look missing).
 *
 * Anything else is "not confirmed", and the caller must keep whatever it was about to discard: a missing parent
 * directory (an unmounted or renamed folder cannot be told apart from a deleted one), a permission or I/O error, a
 * listing that throws, an `exists()` answer that is not a clear yes. Never throws; never touches the disk beyond
 * reading a directory listing.
 */
export async function confirmFileMissing(
  fileSystem: VaultFileSystem,
  absolutePath: string,
  /** Listings already taken in this pass, by directory: lets one pass over many records list a directory once. */
  listings: Map<string, Promise<ReadonlySet<string> | null>> = new Map()
): Promise<boolean> {
  const slash = absolutePath.lastIndexOf('/');
  if (slash <= 0) return false;

  const parent = absolutePath.slice(0, slash);
  const name = absolutePath.slice(slash + 1);
  if (name === '') return false;

  let listing = listings.get(parent);
  if (!listing) {
    listing = listDirectory(fileSystem, parent);
    listings.set(parent, listing);
  }

  const names = await listing;

  return names !== null && !names.has(normalizeName(name));
}

/** The normalised names in `directory`, or null when it cannot be positively listed. Never throws. */
async function listDirectory(fileSystem: VaultFileSystem, directory: string): Promise<ReadonlySet<string> | null> {
  try {
    if ((await fileSystem.exists(directory)) !== true) return null;

    return new Set((await fileSystem.readDirectory(directory)).map((entry) => normalizeName(entry.name)));
  } catch {
    return null;
  }
}
