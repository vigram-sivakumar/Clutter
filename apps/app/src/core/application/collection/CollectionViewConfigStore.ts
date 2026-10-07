import {
  mergeAndWriteWorkspaceStateFile,
  readWorkspaceStateFileText,
} from '../../vault/initialize/workspaceStateFile';
import { isPropertyId, type PropertyId } from '../../properties/collectionProperties';
import type { CollectionSort } from '../../properties/collectionSort';
import { isSidebarSortKey, type SidebarSort } from '../../properties/sidebarSort';
import {
  isCollectionLayout,
  type CollectionViewConfig,
  type LegacyCollectionProperties,
  type PersistedCollectionViewConfig,
  type PropertyOverrides,
} from '../../properties/collectionViewConfig';
import { WORKSPACE_STATE_RELATIVE_PATH } from '../../vault/initialize/ReservedResources';
import type { VaultFileSystem } from '../../vault/providers/VaultFileSystem';

/**
 * A single collection's persisted Configure-menu state — USER INTENT only
 * (`CollectionViewConfig`, core/properties): the layout, the property
 * overrides against the collection's defaults, and the sort. Every field is
 * optional: an entry is written one field at a time (`update()`'s patch
 * shape, mirroring `TagOperations.updateMetadata()`), and a field a collection
 * never touched simply isn't present, resolved to the collection's own
 * default by `resolveCollectionView` — this store has no opinion on what
 * those defaults are, and never records them.
 *
 * Two retired shapes are still READ so nobody's saved choices are lost: the
 * `properties` snapshot (eight booleans, kept as `legacyProperties` until its
 * collection is next changed — converting it needs the collection's
 * definition, which this store does not have) and the sort's `{ key,
 * direction }` (the same ids as `{ property, direction }`, converted on load).
 * Only the intent shape is written, except for an entry the user has not
 * touched since, whose legacy snapshot is written back as it was.
 */
export type { PersistedCollectionViewConfig };

/**
 * Keys that used to hold a collection's configuration, per current key, newest first. The Task
 * Collection's six views share `view:tasks`; All Tasks briefly saved its settings under
 * `view:tasks-all` (ADR-045) before that.
 */
const LEGACY_KEY_FALLBACKS: Readonly<Record<string, readonly string[]>> = {
  'view:tasks': ['view:tasks-all'],
};

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
    return this.read(collectionKey);
  }

  /**
   * An entry, or — when the key has none yet — the one a retired key left behind
   * (`LEGACY_KEY_FALLBACKS`). A fallback is only ever READ: the first `update()` of the new key merges
   * on top of it and writes the new key, after which the old entry is never consulted again. Nothing
   * is deleted or overwritten, so a saved choice survives the key change.
   */
  private read(collectionKey: string): PersistedCollectionViewConfig | undefined {
    const direct = this.entries.get(collectionKey);

    if (direct !== undefined) {
      return direct;
    }

    for (const legacyKey of LEGACY_KEY_FALLBACKS[collectionKey] ?? []) {
      const legacy = this.entries.get(legacyKey);

      if (legacy !== undefined) {
        return legacy;
      }
    }

    return undefined;
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
  update(collectionKey: string, patch: Partial<CollectionViewConfig>): void {
    const existing = this.read(collectionKey);
    // Writing property intent retires the legacy snapshot: the caller converted it (against the
    // collection's definition) into the overrides it is now writing, so it must not linger.
    const base = 'propertyOverrides' in patch ? { ...existing, legacyProperties: undefined } : existing;
    const merged = compact({ ...base, ...patch });

    if (merged === undefined) {
      this.entries.delete(collectionKey);
    } else {
      this.entries.set(collectionKey, merged);
    }
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
    const collectionViewConfig: Record<string, unknown> = {};
    for (const [key, entry] of this.entries) {
      const { legacyProperties, ...intent } = entry;
      // An entry the user has not touched since the migration keeps its legacy snapshot, written back as it was.
      collectionViewConfig[key] = legacyProperties === undefined ? intent : { ...intent, properties: legacyProperties };
    }

    await mergeAndWriteWorkspaceStateFile(this.fileSystem, this.rootPath, {
      collectionViewConfig,
    });
  }
}

/** An entry without its absent (undefined) fields, or `undefined` when nothing is left — so "clear this field" and "no entry" are the same thing. */
function compact(entry: PersistedCollectionViewConfig): PersistedCollectionViewConfig | undefined {
  const { layout, propertyOverrides, sort, sidebarSort, legacyProperties } = entry;
  const result: PersistedCollectionViewConfig = {
    ...(layout !== undefined && { layout }),
    ...(propertyOverrides !== undefined && Object.keys(propertyOverrides).length > 0 && { propertyOverrides }),
    ...(sort !== undefined && { sort }),
    ...(sidebarSort !== undefined && { sidebarSort }),
    ...(legacyProperties !== undefined && { legacyProperties }),
  };

  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Reads one stored entry, field by field: a malformed field is dropped and the valid ones
 * kept (a bad `properties` snapshot never costs the user their layout); an entry with no valid
 * field at all carries no information and is discarded outright.
 */
function parseCollectionViewConfigEntry(raw: unknown): PersistedCollectionViewConfig | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return undefined;
  }

  const { layout, propertyOverrides, properties, sort, sidebarSort } = raw as {
    layout?: unknown;
    propertyOverrides?: unknown;
    properties?: unknown;
    sort?: unknown;
    sidebarSort?: unknown;
  };

  return compact({
    ...(isCollectionLayout(layout) && { layout }),
    ...(parsePropertyOverrides(propertyOverrides) && { propertyOverrides: parsePropertyOverrides(propertyOverrides) }),
    ...(parseLegacyProperties(properties) && { legacyProperties: parseLegacyProperties(properties) }),
    ...(parseSort(sort) && { sort: parseSort(sort) }),
    ...(parseSidebarSort(sidebarSort) && { sidebarSort: parseSidebarSort(sidebarSort) }),
  });
}

/** `{ <property id>: boolean }`: unknown ids and non-boolean values are dropped one by one; nothing left means no overrides. */
function parsePropertyOverrides(raw: unknown): PropertyOverrides | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return undefined;
  }

  const overrides: Partial<Record<PropertyId, boolean>> = {};
  for (const [id, value] of Object.entries(raw)) {
    if (isPropertyId(id) && typeof value === 'boolean') {
      overrides[id] = value;
    }
  }

  return Object.keys(overrides).length > 0 ? overrides : undefined;
}

/**
 * The retired snapshot: description / created / updated are mandatory; the rest are optional
 * (older entries lack them). Any non-boolean makes the whole snapshot unreadable.
 */
function parseLegacyProperties(raw: unknown): LegacyCollectionProperties | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return undefined;
  }

  const { description, created, updated, archived, cover, preview, title, size } = raw as Record<string, unknown>;

  if (
    typeof description !== 'boolean' ||
    typeof created !== 'boolean' ||
    typeof updated !== 'boolean'
  ) {
    return undefined;
  }

  // The optional toggles: absent is fine (older entries), present-but-not-
  // boolean discards the whole entry like any other malformed field.
  const optional = { archived, cover, preview, title, size };
  for (const value of Object.values(optional)) {
    if (value !== undefined && typeof value !== 'boolean') {
      return undefined;
    }
  }

  return {
    description,
    created,
    updated,
    ...(archived !== undefined && { archived: archived as boolean }),
    ...(cover !== undefined && { cover: cover as boolean }),
    ...(preview !== undefined && { preview: preview as boolean }),
    ...(title !== undefined && { title: title as boolean }),
    ...(size !== undefined && { size: size as boolean }),
  };
}

function parseSort(raw: unknown): CollectionSort | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return undefined;
  }

  // `property` is the current field; `key` is what entries written before the registry used.
  const { property, key, direction } = raw as { property?: unknown; key?: unknown; direction?: unknown };
  const id = property ?? key;

  if (!isPropertyId(id)) {
    return undefined;
  }

  if (direction !== 'down' && direction !== 'up') {
    return undefined;
  }

  return { property: id, direction };
}

function parseSidebarSort(raw: unknown): SidebarSort | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return undefined;
  }

  const { key, direction } = raw as { key?: unknown; direction?: unknown };

  if (!isSidebarSortKey(key) || (direction !== 'down' && direction !== 'up')) {
    return undefined;
  }

  return { key, direction };
}
