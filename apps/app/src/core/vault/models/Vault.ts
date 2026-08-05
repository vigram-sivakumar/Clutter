import type { Page } from './Page';
import type { Folder } from './Folder';
import type { Tag, TagMetadataEntry } from './Tag';
import type { TaskOccurrence } from './occurrences/TaskOccurrence';
import type { Embed } from './Embed';
import type { KnowledgeGraph } from './graph/KnowledgeGraph';
import type { VaultProjectionBuilder } from '../knowledge/VaultProjectionBuilder';
import {
  RESERVED_FOLDER_NAMES,
  reservedFolderRelativePath,
  type ReservedFolderId,
} from '../initialize/ReservedResources';
import { VaultPath } from '../ingest/VaultPath';

export type VaultChangeEvent =
  | {
      type: 'page-changed';
      pageId: string;
    }
  | {
      type: 'page-added';
      pageId: string;
    }
  | {
      type: 'page-removed';
      pageId: string;
    }
  | {
      type: 'page-moved';
      pageId: string;
      path: string;
    }
  | {
      type: 'folder-moved';
      folderId: string;
      path: string;
    }
  | {
      type: 'folder-added';
      folderId: string;
    }
  | {
      type: 'folder-removed';
      folderId: string;
    }
  | {
      type: 'tag-metadata-changed';
    };

type VaultChangeListener = (event: VaultChangeEvent) => void;

/**
 * Immutable in-memory representation of a vault.
 *
 * The Vault owns the application's domain model and derived indexes.
 * It performs no filesystem operations, startup orchestration, or
 * runtime page management.
 *
 * All collections are rebuilt from the filesystem during startup.
 */
export class Vault {
  private readonly pagesById = new Map<string, Page>();
  // Canonical lookup by the page's current relative filesystem path.
  // Unlike page IDs, paths may change when pages are renamed or moved.
  private readonly pagesByPath = new Map<string, Page>();
  private readonly foldersById = new Map<string, Folder>();
  // Canonical lookup by the folder's current filesystem path.
  // Folder IDs remain stable, while paths may change after moves.
  private readonly foldersByPath = new Map<string, Folder>();
  // Vault-wide projections derived from page analysis.
  //
  // Page.analysis is the canonical owner of extracted semantics. These are
  // disposable projections rebuilt from Pages after every mutation via
  // projectionBuilder, never mutated incrementally in place.
  private readonly tagsByName = new Map<string, Tag>();
  private readonly taskList = new Array<TaskOccurrence>();
  // Lazy: null means invalidated since the last mutation. Rebuilt on next
  // access to embeds()/knowledgeGraph(), not on every mutation — neither
  // has a shipped consumer yet (see ADR-004/ADR-016). Two consecutive
  // accesses with no intervening mutation return the same cached
  // reference, satisfying spec §3a's referential-stability requirement.
  private _embeds: readonly Embed[] | null;
  private _knowledgeGraph: KnowledgeGraph | null;

  private readonly listeners = new Set<VaultChangeListener>();

  // Presentation-only tag metadata (icon today, color later), loaded from
  // .clutter/tags.json — not Vault domain content, never written through
  // the Persistence Gate. Private: an input refreshProjections() folds into
  // TagBuilder on every rebuild, exactly like frontmatter is an input to
  // page building — never a second thing consumers read directly. Callers
  // read only tags(); see setTagMetadata().
  private tagMetadata: ReadonlyMap<string, TagMetadataEntry>;

  constructor(
    public readonly root: string,
    pages: Iterable<Page>,
    folders: Iterable<Folder>,
    tags: Iterable<Tag>,
    tasks: Iterable<TaskOccurrence>,
    embeds: Iterable<Embed>,
    knowledgeGraph: KnowledgeGraph,
    private readonly projectionBuilder: VaultProjectionBuilder,
    tagMetadata: ReadonlyMap<string, TagMetadataEntry> = new Map()
  ) {
    this.tagMetadata = tagMetadata;
    this._embeds = Array.from(embeds);
    this._knowledgeGraph = knowledgeGraph;

    for (const folder of folders) {
      if (this.foldersById.has(folder.id)) {
        throw new Error(`Duplicate folder ID: ${folder.id}`);
      }

      this.foldersById.set(folder.id, folder);
      this.foldersByPath.set(folder.path, folder);
    }

    for (const tag of tags) {
      if (this.tagsByName.has(tag.name)) {
        throw new Error(`Duplicate tag: ${tag.name}`);
      }

      this.tagsByName.set(tag.name, tag);
    }

    for (const task of tasks) {
      this.taskList.push(task);
    }

    for (const page of pages) {
      if (this.pagesById.has(page.id)) {
        throw new Error(`Duplicate page ID: ${page.id}`);
      }

      this.pagesById.set(page.id, page);
      this.pagesByPath.set(page.path, page);
    }
  }

  getFolder(id: string): Folder | undefined {
    return this.foldersById.get(id);
  }

  getFolderByPath(path: string): Folder | undefined {
    return this.foldersByPath.get(path);
  }

  /**
   * Resolves a reserved top-level folder by stable identifier.
   *
   * Reserved folder paths are defined in ReservedResources — callers should
   * use this method rather than constructing paths manually.
   */
  getReservedFolder(id: ReservedFolderId): Folder | undefined {
    const relativePath = reservedFolderRelativePath(id);
    return this.getFolderByPath(`${this.root}/${relativePath}`);
  }

  /**
   * Returns true when the folder is a top-level reserved application
   * infrastructure folder (Archive, Inbox, Templates, Daily Notes, .clutter).
   * Nested folders under reserved roots are not reserved.
   */
  isReservedFolder(folder: Folder): boolean {
    if (folder.parentId !== null) {
      return false;
    }

    return isReservedTopLevelFolderPath(this.root, folder.path);
  }

  /**
   * Every folder nested (at any depth) inside folderId, and every page
   * whose parentId is that folder or one of those nested folders (ADR-024).
   * A pure read, freely callable from anywhere — not a mutation method.
   *
   * The one implementation of this subtree walk: removeFolder() uses it
   * to know what to delete, moveFolder() uses the equivalent inline
   * (recomputing paths rather than removing, so it isn't a drop-in
   * consumer of this exact shape), and the Persistence Gate's cascade
   * delete (ADR-024 §5) uses it to know what to delete from disk, in the
   * same order, before calling removeFolder(). A future descendant-count
   * UI (e.g. a delete-confirmation dialog) is the same read, not a new one.
   */
  getDescendantFoldersAndPages(folderId: string): {
    readonly folders: readonly Folder[];
    readonly pages: readonly Page[];
  } {
    const folder = this.foldersById.get(folderId);

    if (!folder) {
      throw new Error(`Unknown folder: ${folderId}`);
    }

    const descendantFolders = [...this.foldersById.values()].filter(
      (candidate) =>
        candidate.id !== folderId &&
        VaultPath.isDescendantOf(candidate.path, folder.path)
    );

    const subtreeFolderIds = new Set([folderId, ...descendantFolders.map((f) => f.id)]);

    const pages = [...this.pagesById.values()].filter(
      (page) => page.parentId !== null && subtreeFolderIds.has(page.parentId)
    );

    return { folders: descendantFolders, pages };
  }

  *folders(): IterableIterator<Folder> {
    yield* this.foldersById.values();
  }
  *tags(): IterableIterator<Tag> {
    yield* this.tagsByName.values();
  }

  /**
   * Direct lookup by Tag's one natural identity — name (a Tag has no
   * separate id/path axis the way Page/Folder do). Mirrors getPage(id)/
   * getFolder(id): O(1) via the same map tags()/refreshProjections()
   * already maintain, not a new index. Exact match on the as-typed
   * casing tags() itself preserves — callers that only have a
   * differently-cased name should normalize before calling this, the
   * same way TagBuilder/TagOperations already do at their own comparison
   * points.
   */
  getTagByName(name: string): Tag | undefined {
    return this.tagsByName.get(name);
  }

  *tasks(): IterableIterator<TaskOccurrence> {
    yield* this.taskList;
  }

  /**
   * Lazy: rebuilds only if invalidated by a mutation since the last call to
   * embeds() or knowledgeGraph() (see ensureLazyProjectionsFresh()).
   */
  embeds(): Iterable<Embed> {
    this.ensureLazyProjectionsFresh();
    return this._embeds!;
  }

  get tagCount(): number {
    return this.tagsByName.size;
  }

  get taskCount(): number {
    return this.taskList.length;
  }

  get embedCount(): number {
    this.ensureLazyProjectionsFresh();
    return this._embeds!.length;
  }

  get folderCount(): number {
    return this.foldersById.size;
  }

  /**
   * Lazy: rebuilds only if invalidated by a mutation since the last call to
   * embeds() or knowledgeGraph() (see ensureLazyProjectionsFresh()).
   */
  knowledgeGraph(): KnowledgeGraph {
    this.ensureLazyProjectionsFresh();
    return this._knowledgeGraph!;
  }

  /**
   * Rebuilds tags and tasks from the current set of Pages, and invalidates
   * (but does not rebuild) embeds and the knowledge graph.
   *
   * Tags/tasks have real, already-shipped consumers, so they stay eagerly
   * correct on every mutation — the same trade this method always made.
   * Embeds/knowledgeGraph have none yet (see ADR-004/ADR-016), so rebuilding
   * them here would be pure waste: nothing reads the eagerly-rebuilt value
   * before the next mutation invalidates it anyway. They rebuild lazily,
   * only when embeds()/knowledgeGraph()/embedCount is actually called.
   *
   * Projections are disposable and always fully reconstructable from Pages,
   * the authoritative source of truth, whichever way they rebuild — this
   * only changes *when* embeds/knowledgeGraph recompute, never whether they
   * can drift from the Pages they were derived from.
   */
  private refreshProjections(): void {
    const eager = this.projectionBuilder.buildEager(
      this.pagesById.values(),
      this.tagMetadata
    );

    this.tagsByName.clear();
    for (const tag of eager.tags) {
      this.tagsByName.set(tag.name, tag);
    }

    this.taskList.length = 0;
    this.taskList.push(...eager.tasks);

    this._embeds = null;
    this._knowledgeGraph = null;
  }

  /**
   * The single place embeds/knowledgeGraph actually rebuild. Called only
   * from their own accessors — never from refreshProjections() — so a
   * mutation invalidates them without paying their rebuild cost until
   * something asks for the result.
   */
  private ensureLazyProjectionsFresh(): void {
    if (this._embeds !== null && this._knowledgeGraph !== null) {
      return;
    }

    const lazy = this.projectionBuilder.buildLazy(this.pagesById.values());

    this._embeds = lazy.embeds;
    this._knowledgeGraph = lazy.knowledgeGraph;
  }

  getPage(id: string): Page | undefined {
    return this.pagesById.get(id);
  }

  subscribe(listener: VaultChangeListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(event: VaultChangeEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  /**
   * Updates the current tag presentation metadata and rebuilds the tags()
   * projection from it, exactly like any other mutation rebuilds eager
   * projections — no second rebuild path, no second projection lifecycle.
   *
   * Called only by TagOperations (see ARCHITECTURE_RULES.md rule 3's
   * caller list — this is a narrow, documented addition to it, mirroring
   * ADR-014's DailyNoteService.ensurePage() exception: tag metadata is
   * presentation configuration, not Vault domain content written through
   * the Persistence Gate, so the concurrency rationale behind restricting
   * mutation methods to Gate/Sync doesn't apply here). PagePersistenceCoordinator
   * and VaultSyncService never call this and never reference tags.json.
   */
  setTagMetadata(metadata: ReadonlyMap<string, TagMetadataEntry>): void {
    this.tagMetadata = metadata;
    this.refreshProjections();
    this.notify({ type: 'tag-metadata-changed' });
  }

  /**
   * Replaces an existing page with a newer immutable instance.
   *
   * Used after successful persistence so the in-memory Vault reflects the
   * latest committed document without rebuilding the entire Vault.
   */
  replacePage(page: Page): void {
    const existing = this.pagesById.get(page.id);

    if (!existing) {
      throw new Error(`Cannot replace unknown page: ${page.id}`);
    }

    if (existing.path !== page.path) {
      this.assertPathAvailable(page.path);
    }

    this.pagesById.set(page.id, page);

    if (existing.path !== page.path) {
      this.pagesByPath.delete(existing.path);
    }

    this.pagesByPath.set(page.path, page);
    this.refreshProjections();

    if (existing.path === page.path) {
      this.notify({
        type: 'page-changed',
        pageId: page.id,
      });
    } else {
      this.notify({
        type: 'page-moved',
        pageId: page.id,
        path: page.path,
      });
    }
  }

  addPage(page: Page): void {
    if (this.pagesById.has(page.id)) {
      throw new Error(`Page already exists: ${page.id}`);
    }

    this.assertPathAvailable(page.path);

    this.pagesById.set(page.id, page);
    this.pagesByPath.set(page.path, page);
    this.refreshProjections();

    this.notify({
      type: 'page-added',
      pageId: page.id,
    });
  }

  removePage(pageId: string): void {
    const page = this.pagesById.get(pageId);

    if (!page) {
      throw new Error(`Cannot remove unknown page: ${pageId}`);
    }

    this.pagesById.delete(pageId);
    this.pagesByPath.delete(page.path);
    this.refreshProjections();

    this.notify({
      type: 'page-removed',
      pageId,
    });
  }

  /**
   * Updates a page's path/parentId — the one Vault mutation both a pure
   * folder move (filename unchanged) and a rename (filename changes, same
   * parent) share, per PagePathResolver.resolveRenamePath's use of this
   * same method. `name` is recomputed from the new path every time (mirrors
   * moveFolder's `name: VaultPath.filename(path)` recompute for folders) —
   * a no-op for a plain move, since the filename doesn't change; correct
   * for a rename, since it does.
   */
  updatePagePath(
    pageId: string,
    path: string,
    parentId: string | null
  ): void {
    const page = this.pagesById.get(pageId);

    if (!page) {
      throw new Error(`Cannot move unknown page: ${pageId}`);
    }

    if (page.path === path && page.parentId === parentId) {
      return;
    }

    this.assertPathAvailable(path, pageId);

    this.pagesByPath.delete(page.path);

    const updatedPage: Page = {
      ...page,
      name: VaultPath.pageName(path),
      path,
      parentId,
    };

    this.pagesById.set(pageId, updatedPage);
    this.pagesByPath.set(path, updatedPage);
    this.refreshProjections();

    this.notify({
      type: 'page-moved',
      pageId,
      path,
    });
  }

  /**
   * Registers a newly created Folder as the Vault's live source of truth.
   *
   * Mirrors addPage(): folders otherwise enter the Vault only once, via the
   * startup scan (VaultBuilder) — this is the one other entry point, used
   * by FolderOperations.create() through the Persistence Gate.
   */
  addFolder(folder: Folder): void {
    if (this.foldersById.has(folder.id)) {
      throw new Error(`Folder already exists: ${folder.id}`);
    }

    this.assertFolderPathAvailable(folder.path);

    this.foldersById.set(folder.id, folder);
    this.foldersByPath.set(folder.path, folder);

    this.notify({
      type: 'folder-added',
      folderId: folder.id,
    });
  }

  /**
   * Guards the "one path maps to one folder" invariant, mirroring
   * assertPathAvailable's page equivalent.
   */
  private assertFolderPathAvailable(path: string): void {
    const occupant = this.foldersByPath.get(path);

    if (occupant) {
      throw new Error(`Folder path already in use: ${path}`);
    }
  }

  moveFolder(folderId: string, path: string, parentId: string | null): void {
    const folder = this.foldersById.get(folderId);

    if (!folder) {
      throw new Error(`Unknown folder: ${folderId}`);
    }

    if (folder.path === path && folder.parentId === parentId) {
      return;
    }

    const oldPrefix = folder.path;

    if (
      this.foldersByPath.has(path) &&
      this.foldersByPath.get(path)?.id !== folderId
    ) {
      throw new Error(`Folder path already in use: ${path}`);
    }

    const descendantFolders = [...this.foldersById.values()].filter(
      (candidate) =>
        candidate.id !== folderId &&
        VaultPath.isDescendantOf(candidate.path, oldPrefix)
    );

    const folderPathUpdates = new Map<string, string>();
    folderPathUpdates.set(folderId, path);

    for (const descendant of descendantFolders) {
      folderPathUpdates.set(
        descendant.id,
        path + descendant.path.slice(oldPrefix.length)
      );
    }

    for (const [id, nextPath] of folderPathUpdates) {
      const occupant = this.foldersByPath.get(nextPath);

      if (occupant && occupant.id !== id && !folderPathUpdates.has(occupant.id)) {
        throw new Error(`Folder path already in use: ${nextPath}`);
      }
    }

    const subtreeFolderIds = new Set(folderPathUpdates.keys());
    const pagesInSubtree = [...this.pagesById.values()].filter(
      (page) => page.parentId !== null && subtreeFolderIds.has(page.parentId)
    );

    const pagePathUpdates = new Map<string, string>();

    for (const page of pagesInSubtree) {
      pagePathUpdates.set(
        page.id,
        path + page.path.slice(oldPrefix.length)
      );
    }

    for (const [id, nextPath] of pagePathUpdates) {
      const occupant = this.pagesByPath.get(nextPath);

      if (occupant && occupant.id !== id && !pagePathUpdates.has(occupant.id)) {
        throw new Error(`Path already in use by another page: ${nextPath}`);
      }
    }

    for (const descendant of descendantFolders) {
      this.foldersByPath.delete(descendant.path);
    }

    this.foldersByPath.delete(folder.path);

    for (const page of pagesInSubtree) {
      this.pagesByPath.delete(page.path);
    }

    // name is recomputed from the new path's filename — until ADR-024, this
    // method was only ever exercised by FolderOperations.create() (which
    // never changes an existing folder's basename), so a change to the
    // trailing path segment (a rename) never had a live caller to surface
    // this. moveFolder() covers both move and rename (only the interim
    // 'rename-folder' Gate kind calls it with a changed basename today,
    // per the ADR's implementation-sequencing amendment).
    const movedFolder: Folder = {
      ...folder,
      path,
      parentId,
      name: VaultPath.filename(path),
    };

    this.foldersById.set(folderId, movedFolder);
    this.foldersByPath.set(path, movedFolder);

    for (const descendant of descendantFolders) {
      const nextPath = folderPathUpdates.get(descendant.id)!;
      const updatedFolder: Folder = {
        ...descendant,
        path: nextPath,
      };

      this.foldersById.set(descendant.id, updatedFolder);
      this.foldersByPath.set(nextPath, updatedFolder);
    }

    for (const page of pagesInSubtree) {
      const nextPath = pagePathUpdates.get(page.id)!;
      const updatedPage: Page = {
        ...page,
        path: nextPath,
      };

      this.pagesById.set(page.id, updatedPage);
      this.pagesByPath.set(nextPath, updatedPage);
    }

    if (pagesInSubtree.length > 0) {
      this.refreshProjections();
    }

    this.notify({
      type: 'folder-moved',
      folderId,
      path,
    });
  }

  /**
   * Removes a folder and every page/folder nested inside it (ADR-024).
   *
   * Mirrors moveFolder's descendant-collection pattern exactly (same
   * VaultPath.isDescendantOf walk), since both need the same subtree —
   * moveFolder recomputes its paths, this deletes them outright. One
   * refreshProjections() call if any pages were removed, one
   * `folder-removed` notification for the whole operation regardless of
   * how many descendants it took with it — the same granularity
   * removePage/moveFolder already use, since no subscriber diffs event
   * payloads for per-descendant detail.
   *
   * Caller responsibility (Persistence Gate/Sync only, per rule 3): any
   * disk deletion for the folder's contents must already be complete (app-
   * initiated) or have already happened externally (sync) before this is
   * called — Vault performs zero filesystem I/O, here as everywhere else.
   */
  removeFolder(folderId: string): void {
    const folder = this.foldersById.get(folderId);

    if (!folder) {
      throw new Error(`Cannot remove unknown folder: ${folderId}`);
    }

    const { folders: descendantFolders, pages: pagesInSubtree } =
      this.getDescendantFoldersAndPages(folderId);

    for (const page of pagesInSubtree) {
      this.pagesById.delete(page.id);
      this.pagesByPath.delete(page.path);
    }

    for (const descendant of descendantFolders) {
      this.foldersById.delete(descendant.id);
      this.foldersByPath.delete(descendant.path);
    }

    this.foldersById.delete(folderId);
    this.foldersByPath.delete(folder.path);

    if (pagesInSubtree.length > 0) {
      this.refreshProjections();
    }

    this.notify({
      type: 'folder-removed',
      folderId,
    });
  }

  /**
   * Guards the "one path maps to one page" invariant.
   *
   * pagesByPath is the canonical lookup by filesystem path; silently
   * overwriting an entry would orphan the page that previously held that
   * path — it would remain in pagesById but become unreachable by path.
   */
  private assertPathAvailable(path: string, exceptPageId?: string): void {
    const occupant = this.pagesByPath.get(path);

    if (occupant && occupant.id !== exceptPageId) {
      throw new Error(`Path already in use by another page: ${path}`);
    }
  }

  /**
   * Resolves a page by its canonical relative filesystem path.
   *
   * Used by startup, filesystem synchronization, imports, and other
   * workflows that begin with a filesystem location rather than a page ID.
   */
  getPageByPath(path: string): Page | undefined {
    return this.pagesByPath.get(path);
  }

  *pages(): IterableIterator<Page> {
    yield* this.pagesById.values();
  }

  *notes(): IterableIterator<Page> {
    for (const page of this.pagesById.values()) {
      if (page.type === 'note') {
        yield page;
      }
    }
  }

  *dailyNotes(): IterableIterator<Page> {
    for (const page of this.pagesById.values()) {
      if (page.type === 'daily-note') {
        yield page;
      }
    }
  }

  get pageCount(): number {
    return this.pagesById.size;
  }
}

function isReservedTopLevelFolderPath(
  vaultRoot: string,
  folderPath: string
): boolean {
  if (VaultPath.parentDirectory(folderPath) !== vaultRoot) {
    return false;
  }

  return RESERVED_FOLDER_NAMES.has(VaultPath.filename(folderPath));
}
