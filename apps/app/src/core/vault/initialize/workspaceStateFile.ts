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
 * Every call is serialized through one in-process queue (ADR-035 §9):
 * the read-merge-write above is only clobber-free if no other owner's
 * read lands between this call's read and its write. Without the queue,
 * two owners persisting concurrently could each read the same base and
 * the later write would reinstate the other's stale key. Serializing here,
 * inside the one shared helper, gives every owner (FoldStateStore,
 * CollectionViewConfigStore, TasksViewConfigStore, TagExpansionStore,
 * WorkspaceSessionStore) the guarantee without any of them changing.
 * Process-wide rather than per-vault — only one vault is open at a time,
 * and serializing writes across vaults would merely be slower, never
 * incorrect. Not an atomic-write mechanism (write-then-rename remains out
 * of scope — docs/durability-model.md).
 *
 * A malformed on-disk file at write time (e.g. corrupted externally,
 * mid-session) is treated as empty rather than throwing — this is a
 * best-effort, fire-and-forget persist path, matching every other
 * `.clutter/*` writer's accepted failure posture (see `FoldStateStore`'s
 * own doc comment on `set()`).
 */
export function mergeAndWriteWorkspaceStateFile(
  fileSystem: VaultFileSystem,
  rootPath: string,
  patch: Record<string, unknown>
): Promise<void> {
  const write = writeQueue.then(() => mergeAndWrite(fileSystem, rootPath, patch));
  // A failed write must not wedge the queue for every later writer — the
  // failure still propagates to this call's own caller via `write`.
  writeQueue = write.catch(() => {});
  return write;
}

let writeQueue: Promise<void> = Promise.resolve();

async function mergeAndWrite(
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
