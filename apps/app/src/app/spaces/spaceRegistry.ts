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
    paths: registry.paths.includes(normalized) ? registry.paths : [...registry.paths, normalized],
    activePath: normalized,
  };
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
    const { paths, activePath } = parsed as { paths?: unknown; activePath?: unknown };
    if (
      !Array.isArray(paths) ||
      !paths.every((entry) => typeof entry === 'string' && entry !== '') ||
      typeof activePath !== 'string'
    ) {
      return fallback;
    }
    const unique = Array.from(new Set(paths.map(normalizeSpacePath)));
    const active = normalizeSpacePath(activePath);
    return unique.length > 0 && unique.includes(active)
      ? { paths: unique, activePath: active }
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
