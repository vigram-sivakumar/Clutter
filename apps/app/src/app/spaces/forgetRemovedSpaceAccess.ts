import { STORAGE_KEY, type SpaceRegistryStorage } from './spaceRegistry';

/** The paths a saved registry lists, and the two ends of a rename still in progress. Tolerant: anything else is empty. */
function readPaths(text: string | null): { paths: string[]; renaming: string[] } {
  try {
    const value = JSON.parse(text ?? '') as { paths?: unknown; pendingRename?: { from?: unknown; to?: unknown } | null };
    const paths = Array.isArray(value.paths) ? value.paths.filter((path): path is string => typeof path === 'string') : [];
    const renaming = [value.pendingRename?.from, value.pendingRename?.to].filter((path): path is string => typeof path === 'string');

    return { paths, renaming };
  } catch {
    return { paths: [], renaming: [] };
  }
}

/**
 * Wraps the Space registry's storage so that a Space dropped from the saved registry also has its saved folder access
 * dropped (App Sandbox bookmarks, `space_access.rs`). The saved registry is the one commit point every removal path goes
 * through, so this sees a removal only once it has really been kept, never during a switch that may still be undone.
 *
 * A path that is one end of a pending rename is never forgotten here: the rename moves the access itself, and a failed
 * rename must find the old access still there. A failed `forget` is only logged: the leftover is harmless (the folder
 * simply stays restorable) and the removal itself must not fail because of it.
 */
export function forgetRemovedSpaceAccess(
  inner: SpaceRegistryStorage | null,
  forget: (path: string) => Promise<void>
): SpaceRegistryStorage | null {
  if (!inner) return null;

  let known = readPaths(inner.getItem(STORAGE_KEY)).paths;

  return {
    getItem: (key) => inner.getItem(key),
    setItem: (key, value) => {
      inner.setItem(key, value);
      if (key !== STORAGE_KEY) return;

      const next = readPaths(value);
      const keep = new Set([...next.paths, ...next.renaming]);
      const removed = known.filter((path) => !keep.has(path));

      known = next.paths;
      for (const path of removed) {
        forget(path).catch((error: unknown) => console.warn('Dropping the saved access of a removed space failed:', error));
      }
    },
  };
}
