import { VaultPath } from '@core/vault/ingest/VaultPath';

/**
 * The Spaces this installation knows about, and which one is open. A Space is an
 * existing folder (its path is its identity); the display name is the folder's name.
 * Application-level, so it lives outside every Space (ADR-056).
 */
export interface SpaceRegistry {
  readonly paths: readonly string[];
  /** `null` when no Space has been configured yet (first run in the desktop app). */
  readonly activePath: string | null;
  /**
   * A rename of the active Space's folder that has begun and not been resolved. A best-effort recovery HINT, not a
   * transaction: the registry is one `localStorage` blob, whose write the browser may flush lazily, so after a hard
   * crash it can be missing. `from` stays authoritative until the filesystem rename succeeds and the registry then
   * moves to `to` in one write; startup reconciles an unresolved record before opening anything
   * (`reconcilePendingRename`). `spaceId` is the Space's stable id (`.clutter/workspace.json`) at both paths' check:
   * a consistency check, not proof — a copied Space shares it.
   */
  readonly pendingRename?: PendingRename;
}

export interface PendingRename {
  readonly from: string;
  readonly to: string;
  readonly spaceId: string | null;
}

/** Nothing configured. Never written to storage: only a Space that opened is ever saved. */
export const EMPTY_SPACE_REGISTRY: SpaceRegistry = { paths: [], activePath: null };

export interface SpaceListEntry {
  readonly path: string;
  readonly name: string;
}

export type SpaceRegistryStorage = Pick<Storage, 'getItem' | 'setItem'>;

const STORAGE_KEY = 'clutter.spaces.v1';

/** Strips trailing separators so one folder is never registered twice under two spellings. */
export function normalizeSpacePath(path: string): string {
  const trimmed = path.trim().replace(/\/+$/, '');
  return trimmed === '' && path.startsWith('/') ? '/' : trimmed;
}

export function spaceName(path: string): string {
  return VaultPath.filename(path) || path;
}

export function listSpaces(registry: SpaceRegistry): SpaceListEntry[] {
  return registry.paths.map((path) => ({ path, name: spaceName(path) }));
}

/** Registers `path` if it is new, and makes it active. Selecting a registered Space never duplicates it. */
export function withActiveSpace(registry: SpaceRegistry, path: string): SpaceRegistry {
  const normalized = normalizeSpacePath(path);
  return {
    ...registry,
    paths: registry.paths.includes(normalized) ? registry.paths : [...registry.paths, normalized],
    activePath: normalized,
  };
}

/** `registry` without its pending rename (when there was none, the same object). */
export function withoutPendingRename(registry: SpaceRegistry): SpaceRegistry {
  if (registry.pendingRename === undefined) return registry;
  const { pendingRename: _resolved, ...rest } = registry;
  return rest;
}

/** Records the rename that is about to start. The registry is otherwise unchanged: `from` stays the active path. */
export function withPendingRename(registry: SpaceRegistry, pending: PendingRename): SpaceRegistry {
  return {
    ...registry,
    pendingRename: { from: normalizeSpacePath(pending.from), to: normalizeSpacePath(pending.to), spaceId: pending.spaceId },
  };
}

/**
 * The rename succeeded: the active entry takes the new path and the pending record is resolved, in ONE mutation —
 * so one storage write — never one without the other. Nothing is replaced unless `activePath` is the renamed path.
 */
export function withRenamedActiveSpace(registry: SpaceRegistry, toPath: string): SpaceRegistry {
  const to = normalizeSpacePath(toPath);
  const from = registry.activePath;
  if (from === null || from === to) return withoutPendingRename(registry);
  const paths = Array.from(new Set(registry.paths.map((path) => (path === from ? to : path))));
  return withoutPendingRename({ ...registry, paths, activePath: to });
}

/** The pending record, unless it is about `path` (an explicit choice about that entry settles it). */
function pendingUnless(registry: SpaceRegistry, ...paths: string[]): Pick<SpaceRegistry, 'pendingRename'> {
  const pending = registry.pendingRename;
  return pending === undefined || paths.includes(pending.from) ? {} : { pendingRename: pending };
}

/**
 * The Space registered at `fromPath` is replaced by the folder the user chose at `toPath`: the entry keeps its
 * place in the list and `toPath` becomes the active path. An unregistered `fromPath` just registers and
 * activates `toPath`; if `toPath` is already registered, that entry stays and `fromPath` is dropped. This is the
 * outcome of an explicit choice the user made ("Change path"), never something inferred from the disk.
 */
export function withReplacedSpace(registry: SpaceRegistry, fromPath: string, toPath: string): SpaceRegistry {
  const from = normalizeSpacePath(fromPath);
  const to = normalizeSpacePath(toPath);
  if (from === to || !registry.paths.includes(from)) return withActiveSpace(registry, to);
  const paths = Array.from(new Set(registry.paths.map((path) => (path === from ? to : path))));
  return { paths, activePath: to, ...pendingUnless(registry, from) };
}

/**
 * Forgets a registered Space: only its entry is removed — nothing on disk is touched. The active Space can't be
 * removed (it is open); that, and an unregistered path, change nothing.
 */
export function withoutSpace(registry: SpaceRegistry, path: string): SpaceRegistry {
  const normalized = normalizeSpacePath(path);
  if (normalized === registry.activePath || !registry.paths.includes(normalized)) return registry;
  const { pendingRename: _p, ...rest } = registry;
  return { ...rest, paths: registry.paths.filter((entry) => entry !== normalized), ...pendingUnless(registry, normalized) };
}

/**
 * A registered Space that is NOT the open one now lives at `toPath` (its folder was renamed): its entry keeps its place
 * in the list and the active Space is untouched. Nothing changes for the active entry, an unregistered path, or the
 * same path. A pending rename that was about this entry is settled by it.
 */
export function withRenamedInactiveSpace(registry: SpaceRegistry, fromPath: string, toPath: string): SpaceRegistry {
  const from = normalizeSpacePath(fromPath);
  const to = normalizeSpacePath(toPath);
  if (from === to || from === registry.activePath || !registry.paths.includes(from)) return registry;
  const { pendingRename: _p, ...rest } = registry;
  const paths = Array.from(new Set(registry.paths.map((path) => (path === from ? to : path))));
  return { ...rest, paths, ...pendingUnless(registry, from) };
}

/**
 * Forgets the ACTIVE Space after it has been left or closed: only its entry is removed — nothing on disk is touched.
 * `nextActive` is the registered Space that took its place (already active in practice), or `null` when none did:
 * the remaining entries are kept, unavailable ones included, with no Space active (the Welcome state). A path that
 * is not the active one changes nothing.
 */
export function withoutActiveSpace(registry: SpaceRegistry, nextActive: string | null): SpaceRegistry {
  if (registry.activePath === null) return registry;
  const active = registry.activePath;
  const next = nextActive === null ? null : normalizeSpacePath(nextActive);
  if (next === active) return registry;
  const paths = registry.paths.filter((entry) => entry !== active);
  if (next !== null && !paths.includes(next)) return registry;
  return { paths, activePath: next, ...pendingUnless(registry, active) };
}

/** A well-formed pending rename, or nothing: a malformed or hand-edited record is dropped, never guessed at. */
function parsePendingRename(raw: unknown): PendingRename | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const { from, to, spaceId } = raw as { from?: unknown; to?: unknown; spaceId?: unknown };
  if (typeof from !== 'string' || from === '' || typeof to !== 'string' || to === '') return undefined;
  if (spaceId !== null && typeof spaceId !== 'string') return undefined;
  return { from: normalizeSpacePath(from), to: normalizeSpacePath(to), spaceId: spaceId === '' ? null : spaceId };
}

export function defaultSpaceStorage(): SpaceRegistryStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Tolerant read: anything missing, malformed or inconsistent yields the fallback — never throws and
 * never writes. The fallback is a registry holding `defaultPath` when one is given (the web runtime's
 * in-memory vault), otherwise the empty registry ("no Space configured").
 */
export function loadSpaceRegistry(
  storage: SpaceRegistryStorage | null,
  defaultPath?: string
): SpaceRegistry {
  const fallback: SpaceRegistry =
    defaultPath === undefined
      ? EMPTY_SPACE_REGISTRY
      : { paths: [defaultPath], activePath: defaultPath };

  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) {
      return fallback;
    }
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      return fallback;
    }
    const { paths, activePath, pendingRename } = parsed as {
      paths?: unknown;
      activePath?: unknown;
      pendingRename?: unknown;
    };
    if (
      !Array.isArray(paths) ||
      !paths.every((entry) => typeof entry === 'string' && entry !== '') ||
      (typeof activePath !== 'string' && activePath !== null)
    ) {
      return fallback;
    }
    const unique = Array.from(new Set(paths.map(normalizeSpacePath)));
    // No active Space with entries left: what removing the last openable Space leaves. The entries (even
    // unavailable ones) are kept, and the app starts at Welcome. With no entries at all it is just "nothing configured".
    const pending = parsePendingRename(pendingRename);
    if (activePath === null) {
      return unique.length > 0 ? { paths: unique, activePath: null, ...(pending && { pendingRename: pending }) } : fallback;
    }
    const active = normalizeSpacePath(activePath);
    return unique.length > 0 && unique.includes(active)
      ? { paths: unique, activePath: active, ...(pending && { pendingRename: pending }) }
      : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Best effort: a storage that is full or blocked loses persistence, never the running session.
 * Returns whether the registry was actually written, so the caller can tell the user it won't be remembered.
 */
export function saveSpaceRegistry(storage: SpaceRegistryStorage | null, registry: SpaceRegistry): boolean {
  try {
    if (!storage) return false;
    storage.setItem(STORAGE_KEY, JSON.stringify(registry));
    return true;
  } catch {
    // The in-memory registry still drives this session.
    return false;
  }
}
