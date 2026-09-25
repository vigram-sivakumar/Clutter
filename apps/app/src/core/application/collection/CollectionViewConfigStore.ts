import {
  mergeAndWriteWorkspaceStateFile,
  readWorkspaceStateFileText,
} from '../../vault/initialize/workspaceStateFile';
import { WORKSPACE_STATE_RELATIVE_PATH } from '../../vault/initialize/ReservedResources';
import type { VaultFileSystem } from '../../vault/providers/VaultFileSystem';

export type PersistedCollectionLayout = 'list' | 'table';

export interface PersistedCollectionProperties {
  readonly description: boolean;
  readonly lastOpened: boolean;
  readonly created: boolean;
  readonly updated: boolean;
}

export type PersistedCollectionSortKey = 'name' | 'lastOpened' | 'created' | 'updated';
export type PersistedCollectionSortDirection = 'down' | 'up';

export interface PersistedCollectionSort {
  readonly key: PersistedCollectionSortKey;
  readonly direction: PersistedCollectionSortDirection;
}

/**
 * A single collection's persisted Configure-menu state (Layout/Properties/
 * Sort). Every field is optional: an entry is written one field at a time
 * (`update()`'s patch shape, mirroring `TagOperations.updateMetadata()`),
 * and a field a collection never touched simply isn't present, resolved to
 * its ordinary default by the caller (`PageHost.tsx`) — this store has no
 * opinion on what those defaults are (they're `CollectionBody.tsx`'s
 * `DEFAULT_COLLECTION_*` constants, a UI-layer concern this
 * `core/application` store must not import).
 *
 * Deliberately its own, independent type shapes — not an import of
 * `CollectionViewMode`/`CollectionPropertyVisibility`/`CollectionSortState`
 * from `apps/app/src/app/layouts/page/body/CollectionBody.tsx` — even
 * though they're structurally identical today: that file is UI/Features
 * layer, and `core/application` must never import from it (dependencies
 * point downward — ARCHITECTURE_RULES.md rule 6/`architecture-target.md`'s
 * dependency diagram). The literal unions happen to match exactly, so no
 * conversion is needed at the call site, the same small, accepted
 * duplication `TagOperations`'s own doc comment already establishes
 * ("the raw object -> normalized Map transform... is duplicated, not
 * shared... if the format ever grows real structure, that's the trigger
 * to factor out a shared primitive, not before").
 */
export interface PersistedCollectionViewConfig {
  readonly layout?: PersistedCollectionLayout;
  readonly properties?: PersistedCollectionProperties;
  readonly sort?: PersistedCollectionSort;
}

const VALID_SORT_KEYS: ReadonlySet<string> = new Set([
  'name',
  'lastOpened',
  'created',
  'updated',
]);

/**
 * Owns the `collectionViewConfig` top-level key of `.clutter/workspace.json`
 * end-to-end — a sibling of `FoldStateStore`'s `foldState`/`embedCollapse`
 * keys in the same reserved file, same shape: one reader, one writer,
 * loaded once at boot, in-memory-authoritative for the session, never
 * Gate-backed (`.clutter/*` is application infrastructure, not Vault
 * domain content — ARCHITECTURE_RULES.md rule 2), never owned by
 * `Workspace` (collection view configuration is presentation/UI-display
 * state, not navigation state — the same boundary ADR-033 already drew
 * for fold state, and ADR-021 drew for chrome state kept local instead of
 * lifted into `Workspace`).
 *
 * Keyed by an opaque `CollectionViewKey` (`collectionViewKey.ts`), derived
 * from `Workspace.activeView` — never a new identity scheme.
 *
 * `persist()` uses `mergeAndWriteWorkspaceStateFile`, not a cached
 * boot-time snapshot of `foldState`/`embedCollapse` — see that function's
 * own doc comment for why a second independent writer to this file
 * requires reading the other keys fresh immediately before every write.
 */
export class CollectionViewConfigStore {
  private constructor(
    private readonly fileSystem: VaultFileSystem,
    private readonly rootPath: string,
    private readonly entries: Map<string, PersistedCollectionViewConfig>
  ) {}

  /**
   * An empty store with no persisted entries — `Application`'s constructor
   * default, for the many existing tests that construct `Application`
   * directly without exercising collection-view persistence. Real boot
   * always goes through `load()` instead (see `Application.bootstrap()`).
   */
  static empty(fileSystem: VaultFileSystem, rootPath: string): CollectionViewConfigStore {
    return new CollectionViewConfigStore(fileSystem, rootPath, new Map());
  }

  /**
   * Reads `.clutter/workspace.json` once, at boot — tolerant of a missing
   * file and of malformed JSON or a malformed `collectionViewConfig` shape
   * (caught and discarded, per-entry where possible, logged via
   * `console.warn`, never thrown), the same failure posture ADR-033
   * established for `FoldStateStore.load()`: a corrupted persisted file
   * must never block the app from starting.
   */
  static async load(
    fileSystem: VaultFileSystem,
    rootPath: string
  ): Promise<CollectionViewConfigStore> {
    const contents = await readWorkspaceStateFileText(fileSystem, rootPath);

    let parsed: unknown;
    try {
      parsed = JSON.parse(contents);
    } catch {
      console.warn(
        `CollectionViewConfigStore: ${WORKSPACE_STATE_RELATIVE_PATH} contains invalid JSON — starting with no persisted collection view configuration.`
      );
      return new CollectionViewConfigStore(fileSystem, rootPath, new Map());
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      console.warn(
        `CollectionViewConfigStore: ${WORKSPACE_STATE_RELATIVE_PATH}'s top level is not an object — starting with no persisted collection view configuration.`
      );
      return new CollectionViewConfigStore(fileSystem, rootPath, new Map());
    }

    const { collectionViewConfig } = parsed as Record<string, unknown>;
    const entries = new Map<string, PersistedCollectionViewConfig>();

    if (collectionViewConfig !== undefined) {
      if (
        typeof collectionViewConfig !== 'object' ||
        collectionViewConfig === null ||
        Array.isArray(collectionViewConfig)
      ) {
        console.warn(
          `CollectionViewConfigStore: ${WORKSPACE_STATE_RELATIVE_PATH}'s "collectionViewConfig" is not an object — discarding it.`
        );
      } else {
        for (const [key, rawEntry] of Object.entries(
          collectionViewConfig as Record<string, unknown>
        )) {
          const entry = parseCollectionViewConfigEntry(rawEntry);
          if (entry) {
            entries.set(key, entry);
          } else {
            console.warn(
              `CollectionViewConfigStore: discarding malformed persisted collection view configuration for "${key}".`
            );
          }
        }
      }
    }

    return new CollectionViewConfigStore(fileSystem, rootPath, entries);
  }

  /**
   * A collection's persisted configuration, or `undefined` if none exists
   * — the caller (`PageHost.tsx`) resolves any missing field to the
   * ordinary `CollectionBody.tsx` default, never this store's concern.
   */
  get(collectionKey: string): PersistedCollectionViewConfig | undefined {
    return this.entries.get(collectionKey);
  }

  /**
   * Merges `patch` into `collectionKey`'s existing entry (creating one if
   * absent) and persists the whole store — one mutation method, extensible
   * by field rather than by method count, mirroring
   * `TagOperations.updateMetadata()`. Fire-and-forget, the same accepted
   * posture `FoldStateStore.set()` documents: the caller is a UI event
   * handler, not an `await`-able flow, and a lost write on an abrupt
   * process kill is a rare, accepted edge case.
   */
  update(collectionKey: string, patch: Partial<PersistedCollectionViewConfig>): void {
    const merged: PersistedCollectionViewConfig = {
      ...this.entries.get(collectionKey),
      ...patch,
    };
    this.entries.set(collectionKey, merged);
    void this.persist();
  }

  /**
   * Moves a collection's persisted entry from `oldKey` to `newKey` — the
   * tag-rename integration point `TagOperations.rename()` calls after a
   * successful rename, so a tag's saved Layout/Properties/Sort doesn't
   * become orphaned under its old name (the investigation's "important
   * tag behavior" requirement). A no-op when `oldKey === newKey` (a rename
   * that doesn't change the persisted key at all) or when `oldKey` has no
   * entry (nothing to move — most tags never touch the Configure menu).
   * If `newKey` already has an entry (a genuine identity collision, which
   * `TagOperations.rename()`'s own `findCollision` check already prevents
   * for any rename that would reach this call), `newKey`'s existing entry
   * wins — the same "collision is already prevented upstream, this is just
   * bookkeeping" posture as everywhere else this call happens.
   */
  renameKey(oldKey: string, newKey: string): void {
    if (oldKey === newKey) {
      return;
    }

    const entry = this.entries.get(oldKey);
    if (!entry) {
      return;
    }

    this.entries.delete(oldKey);
    if (!this.entries.has(newKey)) {
      this.entries.set(newKey, entry);
    }
    void this.persist();
  }

  /**
   * Writes `collectionViewConfig` via `mergeAndWriteWorkspaceStateFile` —
   * reading `foldState`/`embedCollapse` (and any other sibling key) fresh
   * immediately before writing, rather than from a boot-time snapshot, so
   * a concurrent `FoldStateStore` write is never clobbered. See that
   * function's own doc comment for the full rationale.
   */
  private async persist(): Promise<void> {
    const collectionViewConfig: Record<string, PersistedCollectionViewConfig> = {};
    for (const [key, entry] of this.entries) {
      collectionViewConfig[key] = entry;
    }

    await mergeAndWriteWorkspaceStateFile(this.fileSystem, this.rootPath, {
      collectionViewConfig,
    });
  }
}

function parseCollectionViewConfigEntry(raw: unknown): PersistedCollectionViewConfig | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return undefined;
  }

  const { layout, properties, sort } = raw as {
    layout?: unknown;
    properties?: unknown;
    sort?: unknown;
  };

  const entry: {
    layout?: PersistedCollectionLayout;
    properties?: PersistedCollectionProperties;
    sort?: PersistedCollectionSort;
  } = {};
  let sawAnyValidField = false;
  let sawAnyField = false;

  if (layout !== undefined) {
    sawAnyField = true;
    if (layout === 'list' || layout === 'table') {
      entry.layout = layout;
      sawAnyValidField = true;
    }
  }

  if (properties !== undefined) {
    sawAnyField = true;
    const parsedProperties = parseProperties(properties);
    if (parsedProperties) {
      entry.properties = parsedProperties;
      sawAnyValidField = true;
    }
  }

  if (sort !== undefined) {
    sawAnyField = true;
    const parsedSort = parseSort(sort);
    if (parsedSort) {
      entry.sort = parsedSort;
      sawAnyValidField = true;
    }
  }

  // An entry with no recognized fields at all (e.g. `{}`, or every field
  // malformed) carries no information — discarded outright, matching
  // FoldStateStore's own per-entry discard-on-malformed posture, rather
  // than kept as a silently-empty `{}` entry.
  if (!sawAnyField || !sawAnyValidField) {
    return undefined;
  }

  return entry;
}

function parseProperties(raw: unknown): PersistedCollectionProperties | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return undefined;
  }

  const { description, lastOpened, created, updated } = raw as Record<string, unknown>;

  if (
    typeof description !== 'boolean' ||
    typeof lastOpened !== 'boolean' ||
    typeof created !== 'boolean' ||
    typeof updated !== 'boolean'
  ) {
    return undefined;
  }

  return { description, lastOpened, created, updated };
}

function parseSort(raw: unknown): PersistedCollectionSort | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return undefined;
  }

  const { key, direction } = raw as { key?: unknown; direction?: unknown };

  if (typeof key !== 'string' || !VALID_SORT_KEYS.has(key)) {
    return undefined;
  }

  if (direction !== 'down' && direction !== 'up') {
    return undefined;
  }

  return { key: key as PersistedCollectionSortKey, direction };
}
