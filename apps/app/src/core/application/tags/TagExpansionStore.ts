import {
  mergeAndWriteWorkspaceStateFile,
  readWorkspaceStateFileText,
} from '../../vault/initialize/workspaceStateFile';
import { WORKSPACE_STATE_RELATIVE_PATH } from '../../vault/initialize/ReservedResources';
import type { VaultFileSystem } from '../../vault/providers/VaultFileSystem';

/**
 * Owns the `tagExpansion` top-level key of `.clutter/workspace.json` — a
 * sibling of `FoldStateStore`'s `foldState`/`embedCollapse` keys and
 * `TasksViewConfigStore`'s `tasksViewConfig` key in the same reserved
 * file, same shape: one reader, one writer, loaded once at boot,
 * in-memory-authoritative for the session, never Gate-backed (`.clutter/*`
 * is application infrastructure, not Vault domain content —
 * ARCHITECTURE_RULES.md rule 2), never owned by `Workspace` (`Workspace`
 * is zero-dependency, in-memory-only navigation state by explicit,
 * twice-reaffirmed design — ADR-006, ADR-021 — and persisted display
 * state doesn't belong there, the same boundary `FoldStateStore`'s own
 * doc comment draws for CM6 fold state).
 *
 * Stores only the tag *names currently expanded* — a tag absent from this
 * set reads as collapsed, which is also the correct answer for a tag
 * that's never been toggled, so a newly-created or never-before-seen tag
 * starts collapsed with no special-casing. Each tag's state is fully
 * independent (plain Set membership, one entry per name).
 *
 * Unlike `TasksViewConfigStore`/`CollectionViewConfigStore`, this store is
 * its own `notify()`-driven Observable (same shape as `Workspace`/
 * `EffectivePageState`) rather than leaving reactivity to a React
 * `useState` lifted in some ancestor component: nothing else already
 * re-renders when a tag's expansion changes, so the store itself has to
 * be the thing a component subscribes to (see `useTagExpansionStore`).
 * The persisted Set remains the sole source of truth either way — a
 * subscriber's re-render is a side effect of a change already applied to
 * (and about to be written out of) this store, never the other way round.
 */
export class TagExpansionStore {
  private readonly expandedTagNames: Set<string>;
  private readonly listeners = new Set<() => void>();

  private constructor(
    private readonly fileSystem: VaultFileSystem,
    private readonly rootPath: string,
    expandedTagNames: Set<string>
  ) {
    this.expandedTagNames = expandedTagNames;
  }

  /**
   * An empty store with no persisted expansion state — `Application`'s
   * constructor default, for the many existing tests that construct
   * `Application` directly without exercising Tags-sidebar persistence.
   * Real boot always goes through `load()` instead (see
   * `Application.bootstrap()`).
   */
  static empty(fileSystem: VaultFileSystem, rootPath: string): TagExpansionStore {
    return new TagExpansionStore(fileSystem, rootPath, new Set());
  }

  /**
   * Reads `.clutter/workspace.json` once, at boot — tolerant of a missing
   * file and of malformed JSON or a malformed `tagExpansion` shape (caught
   * and discarded, logged via `console.warn`, never thrown), the same
   * failure posture `FoldStateStore.load()`/`TasksViewConfigStore.load()`
   * establish: a corrupted persisted file must never block the app from
   * starting.
   */
  static async load(fileSystem: VaultFileSystem, rootPath: string): Promise<TagExpansionStore> {
    const contents = await readWorkspaceStateFileText(fileSystem, rootPath);

    let parsed: unknown;
    try {
      parsed = JSON.parse(contents);
    } catch {
      console.warn(
        `TagExpansionStore: ${WORKSPACE_STATE_RELATIVE_PATH} contains invalid JSON — starting with no persisted tag expansion state.`
      );
      return new TagExpansionStore(fileSystem, rootPath, new Set());
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      console.warn(
        `TagExpansionStore: ${WORKSPACE_STATE_RELATIVE_PATH}'s top level is not an object — starting with no persisted tag expansion state.`
      );
      return new TagExpansionStore(fileSystem, rootPath, new Set());
    }

    const { tagExpansion } = parsed as Record<string, unknown>;

    if (tagExpansion === undefined) {
      return new TagExpansionStore(fileSystem, rootPath, new Set());
    }

    if (!Array.isArray(tagExpansion) || !tagExpansion.every((entry) => typeof entry === 'string')) {
      console.warn(
        `TagExpansionStore: ${WORKSPACE_STATE_RELATIVE_PATH}'s "tagExpansion" is not an array of tag names — discarding it.`
      );
      return new TagExpansionStore(fileSystem, rootPath, new Set());
    }

    return new TagExpansionStore(fileSystem, rootPath, new Set(tagExpansion));
  }

  /**
   * Whether `tagName` is currently expanded in the Tags sidebar — `false`
   * for any name never toggled, which is also the correct "newly
   * encountered tag" answer (collapsed by default).
   */
  isExpanded(tagName: string): boolean {
    return this.expandedTagNames.has(tagName);
  }

  /**
   * Flips `tagName`'s expansion state, notifies subscribers, and persists
   * the whole store. Fire-and-forget on the persist side, the same
   * accepted posture `FoldStateStore.set()`/`TasksViewConfigStore.update()`
   * document: the caller is a UI click handler, not an `await`-able flow.
   */
  toggleExpanded(tagName: string): void {
    if (this.expandedTagNames.has(tagName)) {
      this.expandedTagNames.delete(tagName);
    } else {
      this.expandedTagNames.add(tagName);
    }

    this.notify();
    void this.persist();
  }

  /** Expands `tagName`; a no-op (no notify, no persist) if already expanded. */
  expand(tagName: string): void {
    if (!this.expandedTagNames.has(tagName)) {
      this.toggleExpanded(tagName);
    }
  }

  /**
   * Moves `oldName`'s expanded state to `newName` — the tag-rename
   * integration point `TagOperations.rename()` calls alongside
   * `CollectionViewConfigStore.renameKey()`, so a renamed tag doesn't
   * silently collapse (ADR-035 §9). A no-op when the names are identical
   * or `oldName` isn't expanded (a collapsed tag is just absence from the
   * set, so there is nothing to move).
   */
  renameTag(oldName: string, newName: string): void {
    if (oldName === newName || !this.expandedTagNames.has(oldName)) {
      return;
    }

    this.expandedTagNames.delete(oldName);
    this.expandedTagNames.add(newName);
    this.notify();
    void this.persist();
  }

  /**
   * Registers a store observer — same shape as `Workspace.subscribe`/
   * `EffectivePageState.subscribe`, consumed via `useTagExpansionStore`.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  /**
   * Writes `tagExpansion` via `mergeAndWriteWorkspaceStateFile` — reading
   * the file's other top-level keys fresh immediately before writing,
   * rather than from a boot-time snapshot, so a concurrent write from
   * `FoldStateStore`/`CollectionViewConfigStore`/`TasksViewConfigStore`
   * (sibling owners of other keys in this same file) is never clobbered.
   * See that function's own doc comment for the full rationale.
   */
  private async persist(): Promise<void> {
    await mergeAndWriteWorkspaceStateFile(this.fileSystem, this.rootPath, {
      tagExpansion: Array.from(this.expandedTagNames),
    });
  }
}
