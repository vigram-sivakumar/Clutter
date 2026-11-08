import type { VaultFileSystem } from '../providers/VaultFileSystem';

/**
 * Writes `contents` to `path` so a reader — or a crash — only ever sees the
 * old file or the new file, never a truncated one: the contents go to a
 * Clutter's vault provider replaces a file whole itself through the native
 * atomic writer (`writesAreAtomic`, ADR-063, with its own fsync), so the
 * first branch below is the only one a packaged app takes.
 *
 * The temp-file branch is for a provider that cannot do that. It stages the
 * contents in a sibling temp file, then moves it onto the target. It relies
 * on `moveFile` replacing an existing target, which the local provider's
 * `moveFile` does not do (it never replaces: the destination exists, so it
 * throws `DestinationExistsError`), so it works only over a provider whose
 * move replaces. It guarantees atomicity, not durability: nothing here syncs
 * to disk (see docs/durability-model.md).
 *
 * A failed write removes its temp file (best effort) and rethrows; the
 * target is untouched.
 */
export async function writeFileAtomic(
  fileSystem: VaultFileSystem,
  path: string,
  contents: string
): Promise<void> {
  if (fileSystem.writesAreAtomic) {
    // The provider replaces a file whole itself (ADR-063): staging a sibling temp file would only add a second file
    // that a crash can leave behind, and a `create` for a name an earlier crash already took.
    await fileSystem.writeFile(path, contents, 'upsert');
    return;
  }

  const tempPath = `${path}.tmp`;

  try {
    await fileSystem.writeFile(tempPath, contents, 'upsert');
    await fileSystem.moveFile(tempPath, path);
  } catch (error) {
    try {
      if (await fileSystem.exists(tempPath)) {
        await fileSystem.deleteFile(tempPath);
      }
    } catch {
      // Best effort — the original failure is the one that matters.
    }

    throw error;
  }
}
