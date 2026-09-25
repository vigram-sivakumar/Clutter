import { ensureClutterDirectory } from './ensureClutterDirectory';
import {
  EMPTY_WORKSPACE_STATE_FILE_CONTENTS,
  WORKSPACE_STATE_RELATIVE_PATH,
} from './ReservedResources';
import type { VaultFileSystem } from '../providers/VaultFileSystem';

/**
 * Reads `.clutter/workspace.json`'s raw text, tolerant of a missing file
 * (falls back to the empty-object seed contents) — shared by every reader
 * of this file (`FoldStateStore`, `CollectionViewConfigStore`) so the "does
 * this file exist yet" fallback is one implementation, not N copies. Does
 * NOT parse or validate JSON: each store's own `load()` keeps its own
 * `JSON.parse`/shape-validation/`console.warn` calls, since a malformed
 * *whole file* still needs boot-time, per-store invalidation semantics
 * (which top-level key was affected, what to warn about) that don't belong
 * in a shared primitive.
 */
export async function readWorkspaceStateFileText(
  fileSystem: VaultFileSystem,
  rootPath: string
): Promise<string> {
  const path = `${rootPath}/${WORKSPACE_STATE_RELATIVE_PATH}`;
  return (await fileSystem.exists(path))
    ? await fileSystem.readFile(path)
    : EMPTY_WORKSPACE_STATE_FILE_CONTENTS;
}

/**
 * Merges `patch`'s top-level keys onto whatever `.clutter/workspace.json`
 * currently holds on disk — read fresh immediately before writing, never
 * from a boot-time snapshot — then writes the result back whole.
 *
 * This is what lets `FoldStateStore` (`foldState`/`embedCollapse`) and
 * `CollectionViewConfigStore` (`collectionViewConfig`) each own a disjoint
 * set of top-level keys in the *same* file without one's write clobbering
 * the other's most recent value: `.clutter/workspace.json` was, until
 * `CollectionViewConfigStore` (persisted collection view configuration),
 * a single-writer file (ADR-033 — `FoldStateStore` was its "first real
 * reader/writer"). Two independent in-memory-authoritative stores writing
 * the same file from their own boot-time snapshot of "everything else"
 * would silently revert whichever store's key was updated more recently by
 * the *other* store's next write — this function is the fix: both stores'
 * `persist()` call this instead of writing from a cached snapshot, so a
 * write always layers onto the freshest on-disk state of every key it
 * doesn't itself own.
 *
 * A malformed on-disk file at write time (e.g. corrupted externally,
 * mid-session) is treated as empty rather than throwing — this is a
 * best-effort, fire-and-forget persist path, matching every other
 * `.clutter/*` writer's accepted failure posture (see `FoldStateStore`'s
 * own doc comment on `set()`).
 */
export async function mergeAndWriteWorkspaceStateFile(
  fileSystem: VaultFileSystem,
  rootPath: string,
  patch: Record<string, unknown>
): Promise<void> {
  await ensureClutterDirectory(fileSystem, rootPath);

  const raw = await readWorkspaceStateFileText(fileSystem, rootPath);
  let current: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      current = parsed as Record<string, unknown>;
    }
  } catch {
    // Fall through with an empty base — see doc comment above.
  }

  const path = `${rootPath}/${WORKSPACE_STATE_RELATIVE_PATH}`;
  await fileSystem.writeFile(path, JSON.stringify({ ...current, ...patch }, null, 2));
}
