import {
  mergeAndWriteWorkspaceStateFile,
  readWorkspaceStateFileText,
} from '../../vault/initialize/workspaceStateFile';
import { WORKSPACE_STATE_RELATIVE_PATH } from '../../vault/initialize/ReservedResources';
import type { VaultFileSystem } from '../../vault/providers/VaultFileSystem';

/**
 * The Tasks sidebar's persisted display preferences — whether completed
 * tasks show at all in the Today/Everything else sections, and whether
 * they're auto-sorted to the bottom of their section when shown. A single,
 * shared entry, not one per section: Today and Everything else both read
 * and write the same `tasksViewConfig` key, so toggling either setting
 * from one section's settings menu changes the other's too.
 *
 * Every field is optional, resolved to its ordinary default by the caller
 * (`groupTasks.ts`'s `DEFAULT_TASK_DISPLAY_CONFIG`) — this store has no
 * opinion on what those defaults are, the same posture
 * `PersistedCollectionViewConfig`'s own doc comment documents.
 */
export interface PersistedTasksViewConfig {
  readonly showCompleted?: boolean;
  readonly autoSortCompleted?: boolean;
}

/**
 * Owns the `tasksViewConfig` top-level key of `.clutter/workspace.json` —
 * a sibling of `FoldStateStore`'s `foldState`/`embedCollapse` keys and
 * `CollectionViewConfigStore`'s `collectionViewConfig` key in the same
 * reserved file, same shape: one reader, one writer, loaded once at boot,
 * in-memory-authoritative for the session, never Gate-backed (`.clutter/*`
 * is application infrastructure, not Vault domain content —
 * ARCHITECTURE_RULES.md rule 2), never owned by `Workspace` (this is
 * presentation/display state, not navigation state — the same boundary
 * `CollectionViewConfigStore`'s own doc comment draws).
 *
 * Unlike `CollectionViewConfigStore`, there is no per-identity map here —
 * the Tasks view has exactly one shared configuration, not one per
 * collection — so this store holds a single entry rather than a
 * `Map<string, ...>`.
 *
 * `persist()` uses `mergeAndWriteWorkspaceStateFile`, not a cached
 * boot-time snapshot of the file's other keys — see that function's own
 * doc comment for why a second independent writer to this file requires
 * reading the other keys fresh immediately before every write.
 */
export class TasksViewConfigStore {
  private constructor(
    private readonly fileSystem: VaultFileSystem,
    private readonly rootPath: string,
    private entry: PersistedTasksViewConfig
  ) {}

  /**
   * An empty store with no persisted configuration — `Application`'s
   * constructor default, for the many existing tests that construct
   * `Application` directly without exercising Tasks-view persistence. Real
   * boot always goes through `load()` instead (see `Application.bootstrap()`).
   */
  static empty(fileSystem: VaultFileSystem, rootPath: string): TasksViewConfigStore {
    return new TasksViewConfigStore(fileSystem, rootPath, {});
  }

  /**
   * Reads `.clutter/workspace.json` once, at boot — tolerant of a missing
   * file and of malformed JSON or a malformed `tasksViewConfig` shape
   * (caught and discarded, logged via `console.warn`, never thrown), the
   * same failure posture `CollectionViewConfigStore.load()`/
   * `FoldStateStore.load()` establish: a corrupted persisted file must
   * never block the app from starting.
   */
  static async load(
    fileSystem: VaultFileSystem,
    rootPath: string
  ): Promise<TasksViewConfigStore> {
    const contents = await readWorkspaceStateFileText(fileSystem, rootPath);

    let parsed: unknown;
    try {
      parsed = JSON.parse(contents);
    } catch {
      console.warn(
        `TasksViewConfigStore: ${WORKSPACE_STATE_RELATIVE_PATH} contains invalid JSON — starting with no persisted Tasks view configuration.`
      );
      return new TasksViewConfigStore(fileSystem, rootPath, {});
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      console.warn(
        `TasksViewConfigStore: ${WORKSPACE_STATE_RELATIVE_PATH}'s top level is not an object — starting with no persisted Tasks view configuration.`
      );
      return new TasksViewConfigStore(fileSystem, rootPath, {});
    }

    const { tasksViewConfig } = parsed as Record<string, unknown>;
    const entry = parseTasksViewConfig(tasksViewConfig);

    if (tasksViewConfig !== undefined && !entry) {
      console.warn(
        `TasksViewConfigStore: ${WORKSPACE_STATE_RELATIVE_PATH}'s "tasksViewConfig" is malformed — discarding it.`
      );
    }

    return new TasksViewConfigStore(fileSystem, rootPath, entry ?? {});
  }

  /**
   * The persisted Tasks-view configuration — never `undefined` (an empty
   * object when nothing has been persisted yet), since there is exactly
   * one shared entry rather than one per identity. The caller resolves any
   * missing field to `DEFAULT_TASK_DISPLAY_CONFIG`, never this store's
   * concern.
   */
  get(): PersistedTasksViewConfig {
    return this.entry;
  }

  /**
   * Merges `patch` into the single persisted entry and persists the whole
   * store — one mutation method, extensible by field rather than by method
   * count, mirroring `CollectionViewConfigStore.update()`. Fire-and-forget,
   * the same accepted posture `FoldStateStore.set()` documents: the caller
   * is a UI event handler, not an `await`-able flow, and a lost write on an
   * abrupt process kill is a rare, accepted edge case.
   */
  update(patch: Partial<PersistedTasksViewConfig>): void {
    this.entry = { ...this.entry, ...patch };
    void this.persist();
  }

  /**
   * Writes `tasksViewConfig` via `mergeAndWriteWorkspaceStateFile` —
   * reading the file's other top-level keys fresh immediately before
   * writing, rather than from a boot-time snapshot, so a concurrent write
   * from `FoldStateStore`/`CollectionViewConfigStore` (sibling owners of
   * other keys in this same file) is never clobbered. See that function's
   * own doc comment for the full rationale.
   */
  private async persist(): Promise<void> {
    await mergeAndWriteWorkspaceStateFile(this.fileSystem, this.rootPath, {
      tasksViewConfig: this.entry,
    });
  }
}

function parseTasksViewConfig(raw: unknown): PersistedTasksViewConfig | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return undefined;
  }

  const { showCompleted, autoSortCompleted } = raw as Record<string, unknown>;

  const entry: { showCompleted?: boolean; autoSortCompleted?: boolean } = {};
  let sawAnyValidField = false;
  let sawAnyField = false;

  if (showCompleted !== undefined) {
    sawAnyField = true;
    if (typeof showCompleted === 'boolean') {
      entry.showCompleted = showCompleted;
      sawAnyValidField = true;
    }
  }

  if (autoSortCompleted !== undefined) {
    sawAnyField = true;
    if (typeof autoSortCompleted === 'boolean') {
      entry.autoSortCompleted = autoSortCompleted;
      sawAnyValidField = true;
    }
  }

  // An entry with no recognized fields at all (e.g. `{}`, or every field
  // malformed) carries no information — discarded outright, matching
  // CollectionViewConfigStore's own per-entry discard-on-malformed posture,
  // rather than kept as a silently-empty `{}` entry.
  if (!sawAnyField || !sawAnyValidField) {
    return undefined;
  }

  return entry;
}
