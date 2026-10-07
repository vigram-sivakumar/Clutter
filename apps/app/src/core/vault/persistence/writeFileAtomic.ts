import type { VaultFileSystem } from '../providers/VaultFileSystem';

/**
 * Writes `contents` to `path` so a reader — or a crash — only ever sees the
 * old file or the new file, never a truncated one: the contents go to a
 * sibling temp file first, then replace the target in one rename (atomic on
 * POSIX; `std::fs::rename`, which Tauri's `rename` calls, also replaces an
 * existing file on Windows). Built on `VaultFileSystem` only, so it works
 * over any provider and is observable by the self-write registry.
 *
 * This guarantees *atomicity*, not *durability*: the plugin API has no
 * fsync, so a power loss right after the call may still lose the new
 * contents (never corrupt the old ones) — see docs/durability-model.md.
 *
 * A failed write removes its temp file (best effort) and rethrows; the
 * target is untouched.
 */
export async function writeFileAtomic(
  fileSystem: VaultFileSystem,
  path: string,
  contents: string
): Promise<void> {
  const tempPath = `${path}.tmp`;

  try {
    await fileSystem.writeFile(tempPath, contents);
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
