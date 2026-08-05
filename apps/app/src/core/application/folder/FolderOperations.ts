import { Vault } from '../../vault/models/Vault';
import { Workspace } from '../../workspace/Workspace';
import { PagePersistenceCoordinator } from '../../vault/persistence/PagePersistenceCoordinator';
import { FolderPathResolver } from '../../vault/persistence/FolderPathResolver';
import { FolderCreator } from './FolderCreator';
import type { DocumentRegistry } from '../../engine/DocumentRegistry';
import type { SaveCoordinator } from '../../engine/SaveCoordinator';
import { FieldEditState } from '../../engine/FieldEditState';
import { DocumentState } from '../../engine/DocumentState';

/**
 * The folder-name channel's own debounce/ceiling — mirrors
 * PageOperations' TITLE_AUTOSAVE_DEBOUNCE_MS/CEILING_MS for the identical
 * reason: a folder rename is a real filesystem rename (here, a directory
 * rename cascading to every descendant's path), materially more expensive
 * than an in-place write, so it coalesces more aggressively than a typical
 * body-content autosave would. Placeholder values, not tuned ones, same
 * status as every other autosave-cadence constant in this codebase.
 */
export const FOLDER_NAME_AUTOSAVE_DEBOUNCE_MS = 4000;
export const FOLDER_NAME_AUTOSAVE_CEILING_MS = 60000;

/**
 * The same lifecycle ownership as PageOperations, scoped to folders.
 *
 * create() is eager and immediate-persist, unlike PageOperations' drafts —
 * there is no folder draft lifecycle. The UI is responsible for only
 * calling create() once the user has committed a valid name (see the
 * "New Folder" inline-rename row); this method receives confirmed intent,
 * not a name-in-progress, and persists on the very first call.
 *
 * delete()/rename() added by ADR-024. rename() is an interim, explicitly
 * time-boxed capability (same-parent only — see the ADR's implementation-
 * sequencing amendment); move() remains absent until the Folder Picker UI
 * exists to drive it, the same "no backing capability without a caller
 * that can exercise it" reasoning ADR-012 already applied to page rename.
 *
 * delete()'s post-delete navigation (post-delete-navigation consistency
 * fix) mirrors PageOperations.delete()'s ADR-025 shape exactly — closes
 * every affected workspace entry (its own and every descendant page's),
 * then asks the same Composition-Root-injected fallback hook for a page
 * if nothing is left active. One implementation of "what happens after
 * the active resource disappears," shared by both facades.
 */
export class FolderOperations {
  /**
   * Per-folder name edit/save state — the folder-name channel's
   * counterpart to PageOperations' titleStates, using the exact same
   * FieldEditState<string> shape and SaveCoordinator channel primitives.
   * Lazily created on a folder's first commitName() call.
   */
  private readonly nameStates = new Map<string, FieldEditState<string>>();

  /** In-flight requestNameSave() promises, keyed by nameChannelKey — mirrors PageOperations' inFlightSaves dedup. */
  private readonly inFlightNameSaves = new Map<string, Promise<void>>();

  constructor(
    private readonly vault: Vault,
    private readonly workspace: Workspace,
    private readonly coordinator: PagePersistenceCoordinator,
    private readonly pathResolver: FolderPathResolver,
    private readonly folderCreator: FolderCreator,
    /**
     * Called before this facade changes Workspace's active target — a
     * page-agnostic navigation hook, not a page-specific callback:
     * FolderOperations has no concept of pages or persistence and must
     * not gain one just to flush an outgoing page's autosave
     * (autosave-execution-model.md §2, T5). The Composition Root supplies
     * the actual behavior (today: flush whatever page is active via
     * PageOperations.flushActivePage()) — this class only knows it must
     * call the hook, never what the hook does.
     */
    private readonly prepareNavigation: () => void,
    /**
     * ADR-024 §"Resolved product decisions" #2: delete()'s only reason to
     * touch page-editing state at all — closing every descendant page's
     * open session/timers before enqueueing the cascade delete, mirroring
     * PageOperations.delete()'s own single-page ordering exactly (close
     * first, so no save already in progress from the UI can be newly
     * initiated against a page mid-deletion). FolderOperations still has
     * no concept of drafts/DocumentSession content — it only ever calls
     * close()/cancelTimers() by id, never reads or writes session state.
     */
    private readonly documentRegistry: DocumentRegistry,
    private readonly saveCoordinator: SaveCoordinator,
    /**
     * Post-delete-navigation consistency fix: the exact same
     * Composition-Root-injected hook PageOperations receives (ADR-025) —
     * not a second, folder-specific fallback mechanism. delete() calls
     * this only when, after closing its own workspace entry (and every
     * descendant page's), Workspace is left with no active page/folder at
     * all. FolderOperations still doesn't know what the fallback page is.
     */
    private readonly openFallbackPage: () => void
  ) {}

  /**
   * `options.recordHistory` (default true) passes straight through to
   * `workspace.openFolder()` — ADR-027. See PageOperations.open()'s
   * matching doc comment for who passes `false` and why.
   */
  public async open(
    folderId: string,
    options?: { readonly recordHistory?: boolean }
  ): Promise<void> {
    const folder = this.vault.getFolder(folderId);

    if (!folder) {
      throw new Error(`Folder not found: ${folderId}`);
    }

    this.prepareNavigation();
    // Navigation-away boundary for the outgoing folder's own pending name
    // edit — mirrors PageOperations.flushActivePage()'s guarantee that an
    // uncommitted, still-debouncing autosave can never survive a
    // navigation, extended to folders now that folder names are also
    // channel-backed.
    this.flushActiveFolder();
    this.workspace.openFolder(folderId, options);
  }

  /**
   * Flushes the workspace's currently active folder's name channel, if
   * dirty — the folder-name counterpart to PageOperations.flushActivePage().
   * Called before switching to a different folder (open(), above) and
   * before switching to a page (PageOperations.flushActivePage(), which
   * holds a reference to this class and calls this directly) — either
   * direction of navigation-away must flush an outgoing folder's pending
   * rename the same way.
   */
  public flushActiveFolder(): void {
    const activeFolderId = this.workspace.activeFolderId;

    if (activeFolderId) {
      void this.requestNameSave(activeFolderId);
    }
  }

  /**
   * Creates a new folder under parentId (null for the vault root — mirrors
   * PageOperations.create()'s nullable folderId; Folder.parentId is itself
   * string | null, so a facade that couldn't create at the root would be
   * unable to express a state the domain model already allows).
   *
   * Resolves a collision-free path, mints the folder's persisted id, and
   * enqueues the Gate's 'create-folder' operation — directory + .folder.md
   * + Vault registration all happen there, the one write path.
   */
  public async create(name: string, parentId: string | null): Promise<string> {
    const destination = this.pathResolver.createFolderPath(parentId, name);
    const id = this.folderCreator.generateId();
    const content = this.folderCreator.buildContent(id);

    const result = await this.coordinator.enqueue(id, {
      kind: 'create-folder',
      path: destination.path,
      parentId: destination.parentId,
      content,
    });

    if (result.status !== 'folder-created') {
      throw new Error(
        `Failed to create folder at ${destination.path}: ${
          result.status === 'abandoned' ? result.reason : result.status
        }`
      );
    }

    return result.folder.id;
  }

  /**
   * Deletes a folder and everything nested inside it (ADR-024). No
   * existence check of its own — relies on the Gate's dequeue-time guard
   * (runDeleteFolder abandons harmlessly for an unknown id), the same
   * pattern PageOperations.delete() already uses.
   *
   * Before enqueueing: closes every descendant page's open session and
   * cancels its pending autosave timer, mirroring PageOperations.delete()'s
   * single-page ordering — done here, synchronously, before the cascade
   * delete runs, so no save the UI could still trigger races the deletion.
   * (This does not address an open *draft* — one with no Vault page yet —
   * targeting a to-be-deleted folder; that is a narrower, separately
   * tracked gap, not one this method's cascade can see, since a draft
   * never appears in Vault.getDescendantFoldersAndPages' output.)
   *
   * The confirmation-before-calling-this decision for a non-empty folder
   * (ADR-024 §"Resolved product decisions" #1) lives in the UI, not here —
   * this method is an unconditional cascade once called, same as the
   * Gate's own runDeleteFolder.
   *
   * Post-delete navigation (consistency fix, mirrors PageOperations.delete()
   * exactly): every descendant page's workspace tab is closed via
   * workspace.closePage() — not just its DocumentRegistry session — and the
   * folder's own workspace entry via workspace.closeFolder(), so a deleted
   * folder (or a page nested inside it) can never remain the active view.
   * If that leaves Workspace with no active page/folder at all, the same
   * fallback hook PageOperations.delete() uses is asked for one. Neither
   * facade decides what the fallback is — both only recognize when one is
   * needed.
   */
  public async delete(folderId: string): Promise<void> {
    const folder = this.vault.getFolder(folderId);
    let descendantPageIds: readonly string[] = [];

    if (folder) {
      const { pages } = this.vault.getDescendantFoldersAndPages(folderId);

      descendantPageIds = pages.map((page) => page.id);

      for (const page of pages) {
        this.documentRegistry.close(page.id);
        this.saveCoordinator.cancelTimers(page.id);
      }
    }

    await this.coordinator.enqueue(folderId, { kind: 'delete-folder' });

    for (const pageId of descendantPageIds) {
      this.workspace.closePage(pageId);
    }
    this.workspace.closeFolder(folderId);
    this.disposeNameState(folderId);

    if (!this.workspace.activeView) {
      this.openFallbackPage();
    }
  }

  /**
   * Tears down a folder's name channel, if it has one — no armed timer or
   * live FieldEditState may outlive the folder it belongs to, mirroring
   * PageOperations.disposeTitleState() exactly.
   */
  private disposeNameState(folderId: string): void {
    const nameState = this.nameStates.get(folderId);

    if (!nameState) {
      return;
    }

    this.saveCoordinator.cancelTimers(this.nameChannelKey(folderId));
    nameState.markDisposed();
    this.nameStates.delete(folderId);
  }

  /**
   * Renames a folder in place (ADR-024's interim 'rename-folder' kind —
   * same parent only; see the class docstring and the ADR's
   * implementation-sequencing amendment). No existence check of its own,
   * same reasoning as delete() above.
   */
  public async rename(folderId: string, name: string): Promise<void> {
    const result = await this.coordinator.enqueue(folderId, {
      kind: 'rename-folder',
      name,
    });

    if (result.status !== 'folder-renamed' && result.status !== 'abandoned') {
      throw new Error(`Failed to rename folder ${folderId}: ${result.status}`);
    }
  }

  /** The name channel's SaveCoordinator key — distinct from `folderId` so it can never collide with any other channel keyed by the same id. */
  private nameChannelKey(folderId: string): string {
    return `${folderId}:name`;
  }

  /**
   * Commits a folder's name in memory only — the name-channel counterpart
   * to PageOperations.commitTitle(), same contract: no Gate call, no
   * persistence, just arms the channel's own debounce/ceiling timers
   * (FOLDER_NAME_AUTOSAVE_DEBOUNCE_MS/CEILING_MS).
   */
  public commitName(folderId: string, name: string): void {
    const folder = this.vault.getFolder(folderId);

    if (!folder) {
      throw new Error(`Folder not found: ${folderId}`);
    }

    const nameState = this.nameStates.get(folderId) ?? new FieldEditState(folder.name);

    this.nameStates.set(folderId, nameState);
    nameState.commit(name);

    this.saveCoordinator.scheduleSave(
      this.nameChannelKey(folderId),
      () => {
        void this.requestNameSave(folderId);
      },
      { debounceMs: FOLDER_NAME_AUTOSAVE_DEBOUNCE_MS, ceilingMs: FOLDER_NAME_AUTOSAVE_CEILING_MS }
    );
  }

  /**
   * The name channel's counterpart to PageOperations.requestTitleSave() —
   * same single-entry-point, coalescing, and never-throws contract. A
   * silent no-op if this folder has no name-editing activity.
   */
  public requestNameSave(folderId: string): Promise<void> {
    const key = this.nameChannelKey(folderId);
    const existing = this.inFlightNameSaves.get(key);

    if (existing) {
      return existing;
    }

    const promise = this.runRequestNameSave(folderId).finally(() => {
      if (this.inFlightNameSaves.get(key) === promise) {
        this.inFlightNameSaves.delete(key);
      }
    });

    this.inFlightNameSaves.set(key, promise);

    return promise;
  }

  private async runRequestNameSave(folderId: string): Promise<void> {
    const nameState = this.nameStates.get(folderId);

    if (!nameState) {
      return;
    }

    const key = this.nameChannelKey(folderId);

    for (;;) {
      const decision = this.saveCoordinator.evaluate(nameState.state, nameState.isDirty);

      if (decision === 'suppress') {
        return;
      }

      const value = nameState.currentValue;

      nameState.beginSave();
      this.saveCoordinator.beginChannelSave(key, value);

      try {
        await this.rename(folderId, value);

        if (this.saveCoordinator.completeChannelSave(key, value)) {
          nameState.markSaved(value);
        }
      } catch {
        if (this.saveCoordinator.failChannelSave(key, value)) {
          nameState.markSaveFailed();
        }
        return;
      }
    }
  }

  /**
   * Escape's channel-side counterpart (EditableText.onCancel): reverts the
   * name channel's pending value back to whatever's actually persisted and
   * cancels its armed timer — mirrors PageOperations.cancelTitleEdit()
   * exactly, same "cancel not-yet-executed work, never touch anything
   * already durable" scope.
   */
  public cancelNameEdit(folderId: string): void {
    const nameState = this.nameStates.get(folderId);

    if (!nameState) {
      return;
    }

    nameState.commit(nameState.savedValue);
    this.saveCoordinator.cancelTimers(this.nameChannelKey(folderId));
  }

  /**
   * Shutdown flush for every folder with a dirty or in-flight name
   * channel — the folder-name counterpart to PageOperations.flushAll(),
   * called alongside it from Application.close(). Folders have no
   * DocumentSession/body to flush, so this only ever concerns the name
   * channel.
   */
  public async flushAll(timeoutMs: number): Promise<void> {
    const dirtyOrSavingFolderIds = [...this.nameStates.entries()]
      .filter(
        ([, nameState]) => nameState.isDirty || nameState.state === DocumentState.Saving
      )
      .map(([folderId]) => folderId);

    if (dirtyOrSavingFolderIds.length === 0) {
      return;
    }

    const flushes = Promise.allSettled(
      dirtyOrSavingFolderIds.map((folderId) => this.requestNameSave(folderId))
    );

    await Promise.race([
      flushes,
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  }
}
