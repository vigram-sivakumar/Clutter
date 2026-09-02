import type { Page } from './Page';
import type { Folder } from './Folder';
import type { FolderMetadata } from './FolderMetadata';
import type { VaultResource } from './VaultResource';
import type { Tag, TagMetadataEntry } from './Tag';
import type { TaskOccurrence } from './occurrences/TaskOccurrence';
import type { Embed } from './Embed';
import type { KnowledgeGraph } from './graph/KnowledgeGraph';
import type { VaultProjectionBuilder } from '../knowledge/VaultProjectionBuilder';
import {
  RESERVED_FOLDER_NAMES,
  reservedFolderRelativePath,
  isDailyNotePath,
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
      // The VaultResource counterpart to 'page-moved' — emitted by
      // updateResourcePath() whenever a resource's path/parentId changes.
      // No 'resource-changed' variant exists: a resource has no
      // metadata-only mutation (unlike 'folder-changed').
      type: 'resource-moved';
      resourceId: string;
      path: string;
    }
  | {
      // Emitted by removeResource() — the resource-scoped counterpart to
      // 'page-removed', for the same 'delete-resource' Gate kind's Vault
      // commit step.
      type: 'resource-removed';
      resourceId: string;
    }
  | {
      // Emitted by addResource() — the resource-scoped counterpart to
      // 'page-added'/'folder-added', for Sync's external-resource-create
      // reconciliation (a resource discovered on disk after Vault was
      // already built, mirroring addPage()'s existing external-create
      // caller).
      type: 'resource-added';
      resourceId: string;
    }
  | {
      // A folder's metadata changed in place — no path/parentId change,
      // the folder-scoped counterpart to 'page-changed'. Emitted by
      // updateFolderMetadata() only; archive/restore/move always change
      // path too, so they keep emitting 'folder-moved'.
      type: 'folder-changed';
      folderId: string;
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
  // Non-Markdown supported files (PDF/image). Read-only for now — no
  // add/remove/move mutation methods exist yet (a later step); populated
  // once, at construction, from VaultBuilder's initial scan.
  private readonly resourcesById = new Map<string, VaultResource>();
  private readonly resourcesByPath = new Map<string, VaultResource>();
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
    tagMetadata: ReadonlyMap<string, TagMetadataEntry> = new Map(),
    // Trailing and defaulted so every existing call site across the app
    // (production and the many test fixtures that construct a Vault with
    // positional arguments and don't care about resources) keeps compiling
    // unchanged — see the Step 2 report for why a required, non-trailing
    // parameter here was rejected.
    resources: Iterable<VaultResource> = []
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

    for (const resource of resources) {
      if (this.resourcesById.has(resource.id)) {
        throw new Error(`Duplicate resource ID: ${resource.id}`);
      }

      this.resourcesById.set(resource.id, resource);
      this.resourcesByPath.set(resource.path, resource);
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

  getResource(id: string): VaultResource | undefined {
    return this.resourcesById.get(id);
  }

  getResourceByPath(path: string): VaultResource | undefined {
    return this.resourcesByPath.get(path);
  }

  *resources(): IterableIterator<VaultResource> {
    yield* this.resourcesById.values();
  }

  get resourceCount(): number {
    return this.resourcesById.size;
  }

  /**
   * Case-insensitive counterpart to getFolderByPath() — the real
   * filesystem LocalVaultProvider writes to (macOS/Windows, both
   * case-insensitive by default) treats "Test" and "test" as the same
   * directory, but foldersByPath's Map key does not. Every *collision*
   * check (an isTaken callback deciding a create/move/rename candidate,
   * assertFolderPathAvailable below, FolderOperations.canCreate/canRename)
   * must ask this question, not the exact one — see VaultPath.
   * equalsCaseInsensitive's own doc comment for what goes wrong otherwise.
   * Not a replacement for getFolderByPath(): a lookup resolving a path
   * that is already known-correct (from a disk scan/watcher event, or a
   * deterministic target like Daily Notes) should stay exact, since the
   * scan/watcher already reports the real on-disk casing.
   */
  getFolderByPathCaseInsensitive(path: string): Folder | undefined {
    for (const folder of this.foldersByPath.values()) {
      if (VaultPath.equalsCaseInsensitive(folder.path, path)) {
        return folder;
      }
    }

    return undefined;
  }

  /**
   * Case-insensitive counterpart to getResourceByPath(), mirroring
   * getFolderByPathCaseInsensitive/getPageByPathCaseInsensitive exactly —
   * same reasoning, one aggregate over. The one collision check
   * updateResourcePath() (below) uses to guard "one path maps to one
   * resource."
   */
  getResourceByPathCaseInsensitive(path: string): VaultResource | undefined {
    for (const resource of this.resourcesByPath.values()) {
      if (VaultPath.equalsCaseInsensitive(resource.path, path)) {
        return resource;
      }
    }

    return undefined;
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
   * Every folder nested (at any depth) inside folderId, every page whose
   * parentId is that folder or one of those nested folders (ADR-024), and
   * every resource whose parentId is that folder or one of those nested
   * folders (same subtree-membership rule as pages, extended once
   * VaultResource needed to participate in the same cascade — a resource
   * has no descendants of its own, so it only ever appears as a leaf here,
   * never contributing to `folders`). A pure read, freely callable from
   * anywhere — not a mutation method.
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
    readonly resources: readonly VaultResource[];
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

    const resources = [...this.resourcesById.values()].filter(
      (resource) => resource.parentId !== null && subtreeFolderIds.has(resource.parentId)
    );

    return { folders: descendantFolders, pages, resources };
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
   * latest committed document without rebuilding the entire Vault. Reused
   * for both a pure content save (path unchanged — save, external content
   * edit) and a cross-path operation whose caller already decided the
   * final path (archive, restore) — `type` is recomputed from `page.path`
   * either way (resolvePageType), a no-op for the former, correct for the
   * latter. Callers (PageRebuilder) no longer need to get this right
   * themselves.
   */
  replacePage(page: Page): void {
    const existing = this.pagesById.get(page.id);

    if (!existing) {
      throw new Error(`Cannot replace unknown page: ${page.id}`);
    }

    if (existing.path !== page.path) {
      this.assertPathAvailable(page.path);
    }

    const resolved: Page = { ...page, type: this.resolvePageType(page.path) };

    this.pagesById.set(resolved.id, resolved);

    if (existing.path !== resolved.path) {
      this.pagesByPath.delete(existing.path);
    }

    this.pagesByPath.set(resolved.path, resolved);
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

  /**
   * Registers a newly discovered resource as the Vault's live source of
   * truth — the resource-scoped counterpart to addPage()/addFolder().
   * Unlike those two, this has no app-initiated caller yet (there is still
   * no 'create-resource' Gate kind — resource creation stays out of scope
   * per the approved Resource mutation design): the only caller is Sync,
   * reconciling a resource file that appeared on disk after Vault was
   * already built. No refreshProjections() call, same reasoning
   * updateResourcePath()/removeResource() already establish: a resource
   * contributes to no tag/task/embed/knowledge-graph projection.
   */
  addResource(resource: VaultResource): void {
    if (this.resourcesById.has(resource.id)) {
      throw new Error(`Resource already exists: ${resource.id}`);
    }

    this.assertResourcePathAvailable(resource.path);

    this.resourcesById.set(resource.id, resource);
    this.resourcesByPath.set(resource.path, resource);

    this.notify({
      type: 'resource-added',
      resourceId: resource.id,
    });
  }

  /**
   * Permanently removes a resource — the resource-scoped counterpart to
   * removePage(), backing the Gate's 'delete-resource' kind (and Sync's
   * external-resource-delete reconciliation). No refreshProjections()
   * call, same reasoning as updateResourcePath(): a resource contributes
   * to no tag/task/embed/knowledge-graph projection.
   */
  removeResource(resourceId: string): void {
    const resource = this.resourcesById.get(resourceId);

    if (!resource) {
      throw new Error(`Cannot remove unknown resource: ${resourceId}`);
    }

    this.resourcesById.delete(resourceId);
    this.resourcesByPath.delete(resource.path);

    this.notify({
      type: 'resource-removed',
      resourceId,
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
   * for a rename, since it does. `type` is recomputed the same way: a
   * page's Daily Note vs. Note role is a pure function of its current path
   * (resolvePageType), never persisted frontmatter — this is the one Vault
   * mutation both app-initiated move/rename/restore (MoveService.movePage)
   * and an external filesystem move (VaultSyncService.handleMoved's common
   * case) share, so enforcing the invariant here covers both without
   * duplicating the rule in either caller.
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
      type: this.resolvePageType(path),
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
   * Updates a resource's path/parentId — the VaultResource counterpart to
   * updatePagePath(), same shape: `id` is never recomputed (unlike
   * ResourceBuilder's own path-derived id at scan time — see §3b — this
   * in-place mutation deliberately keeps the resource's existing id stable
   * for the rest of the running session, mirroring how updatePagePath never
   * re-derives a page's id from its new path either). `name` is recomputed
   * from the new path every time via VaultPath.filename() — not
   * VaultPath.pageName() — matching ResourceBuilder's own
   * `name: VaultPath.filename(file.path)` (a resource's display name keeps
   * its extension, unlike a page's). `kind` is carried over unchanged
   * (spread), since neither a move nor a rename ever changes what kind of
   * file a resource is. No refreshProjections() call: unlike a page, a
   * resource contributes to no tag/task/embed/knowledge-graph projection,
   * so a path change here has nothing downstream to invalidate.
   */
  updateResourcePath(
    id: string,
    path: string,
    parentId: string | null
  ): void {
    const resource = this.resourcesById.get(id);

    if (!resource) {
      throw new Error(`Cannot move unknown resource: ${id}`);
    }

    if (resource.path === path && resource.parentId === parentId) {
      return;
    }

    this.assertResourcePathAvailable(path, id);

    this.resourcesByPath.delete(resource.path);

    const updatedResource: VaultResource = {
      ...resource,
      name: VaultPath.filename(path),
      path,
      parentId,
    };

    this.resourcesById.set(id, updatedResource);
    this.resourcesByPath.set(path, updatedResource);

    this.notify({
      type: 'resource-moved',
      resourceId: id,
      path,
    });
  }

  /**
   * Guards the "one path maps to one resource" invariant — the
   * resource-scoped counterpart to assertPathAvailable()/
   * assertFolderPathAvailable() below. Scoped to resourcesByPath only,
   * mirroring those two exactly: neither of them cross-checks against the
   * other entity collections either (a page's assertPathAvailable never
   * checks foldersByPath, and vice versa) — Page and Folder paths are
   * disjoint by construction today (a page path always ends in `.md`, a
   * folder path never does), so Vault has never needed a cross-entity
   * collision check, and this resource-scoped guard deliberately doesn't
   * introduce the first one. A resource's path also carries its own
   * extension (`.png`/`.pdf`, never `.md`), so the same disjointness holds
   * here without any new enforcement.
   */
  private assertResourcePathAvailable(path: string, exceptResourceId?: string): void {
    const occupant = this.getResourceByPathCaseInsensitive(path);

    if (occupant && occupant.id !== exceptResourceId) {
      throw new Error(`Path already in use by another resource: ${path}`);
    }
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
    const occupant = this.getFolderByPathCaseInsensitive(path);

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

    const { pagesInSubtree } = this.relocateFolderSubtree(folderId, path, parentId);

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
   * In-place metadata patch for a folder (e.g. favorite) — path/parentId
   * and everything else about identity are untouched, the folder-scoped
   * counterpart to replacePage() for a metadata-only page save. No
   * projections refresh: unlike page content, a folder's metadata carries
   * no tags/links the knowledge graph derives from.
   */
  updateFolderMetadata(folderId: string, patch: Partial<FolderMetadata>): void {
    const folder = this.foldersById.get(folderId);

    if (!folder) {
      throw new Error(`Unknown folder: ${folderId}`);
    }

    const updated: Folder = { ...folder, metadata: { ...folder.metadata, ...patch } };

    this.foldersById.set(folderId, updated);
    this.foldersByPath.set(updated.path, updated);

    this.notify({
      type: 'folder-changed',
      folderId,
    });
  }

  /**
   * ADR-026 §2: archives a folder by relocating its entire subtree as a
   * single directory move (reusing relocateFolderSubtree — the exact same
   * cascade moveFolder() uses, one aggregate over) into the vault's
   * reserved `Archive/` folder, then patching only the target folder's own
   * metadata. Descendant folders/pages get new paths but their own
   * `status`/`archivedAt`/etc. are left untouched — mirroring
   * ArchiveMetadataReconciler's existing principle that location inside
   * `Archive/` never by itself implies archived status, now applied to
   * folders (visibility for these untouched descendants is handled on the
   * read side by MembershipSelector.isEffectivelyArchived(), not here).
   *
   * `path`/`parentId` are the caller-resolved Archive/ destination
   * (FolderPathResolver.resolveArchiveDestination) — this method performs
   * no path resolution of its own, mirroring moveFolder()'s existing
   * division of responsibility.
   */
  archiveFolder(
    folderId: string,
    path: string,
    parentId: string,
    metadata: Pick<FolderMetadata, 'status' | 'archivedAt' | 'originalPath' | 'originalParentId'>
  ): void {
    const folder = this.foldersById.get(folderId);

    if (!folder) {
      throw new Error(`Unknown folder: ${folderId}`);
    }

    const { pagesInSubtree } = this.relocateFolderSubtree(folderId, path, parentId);

    const relocated = this.foldersById.get(folderId)!;
    const archived: Folder = {
      ...relocated,
      metadata: { ...relocated.metadata, ...metadata },
    };

    this.foldersById.set(folderId, archived);
    this.foldersByPath.set(archived.path, archived);

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
   * Symmetric counterpart to archiveFolder(): relocates the folder's whole
   * subtree back to `path`/`parentId` (the caller-resolved restore
   * destination — FolderPathResolver.resolveRestoreDestination) via the
   * same relocateFolderSubtree() cascade, then clears the target folder's
   * own archive metadata. Descendant folders/pages are relocated but their
   * own metadata is untouched, mirroring archiveFolder()'s identical rule.
   */
  restoreFolder(
    folderId: string,
    path: string,
    parentId: string | null,
    metadata: Pick<FolderMetadata, 'status' | 'archivedAt' | 'originalPath' | 'originalParentId'>
  ): void {
    const folder = this.foldersById.get(folderId);

    if (!folder) {
      throw new Error(`Unknown folder: ${folderId}`);
    }

    const { pagesInSubtree } = this.relocateFolderSubtree(folderId, path, parentId);

    const relocated = this.foldersById.get(folderId)!;
    const restored: Folder = {
      ...relocated,
      metadata: { ...relocated.metadata, ...metadata },
    };

    this.foldersById.set(folderId, restored);
    this.foldersByPath.set(restored.path, restored);

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
   * ADR-026's Sync amendment (external folder unarchive reconciliation):
   * Sync-only repair primitive, mirroring how `persistSyncedPageDocument`
   * reuses `replacePage()` for the page-side equivalent. Relocates the
   * folder (reusing the exact same `relocateFolderSubtree` cascade
   * `moveFolder()`/`archiveFolder()` already share) and applies an
   * arbitrary metadata correction to only the target folder's own
   * metadata — descendants are untouched, per the same principle
   * `archiveFolder()` already established for the archive-write direction.
   *
   * Mechanically near-identical to `archiveFolder()`, deliberately kept as
   * a separate, narrowly-named method rather than a second call site for
   * it: `archiveFolder()` is the app-initiated "become archived" write
   * (Gate-only caller); this is Sync's "external move revealed stale
   * metadata" repair (Sync-only caller, per this file's rule-3 restriction
   * — callable only from vault/persistence/ and vault/sync/). Two
   * different owners for two different conceptual operations, the same
   * reasoning ADR-026 §0/Alternative C already applied to Gate kind-naming
   * (`'archive'`/`'restore'` vs. `'archive-folder'`/`'restore-folder'`).
   *
   * A no-op relocation (path/parentId unchanged) is a valid, idempotent
   * call here — the startup reconciliation pass calls this against a
   * folder's already-current path (nothing moved, only metadata is stale),
   * unlike the live-sync caller, which always passes a genuinely new path.
   */
  correctFolderArchiveMetadata(
    folderId: string,
    path: string,
    parentId: string | null,
    metadata: Pick<FolderMetadata, 'status' | 'archivedAt' | 'originalPath' | 'originalParentId'>
  ): void {
    const folder = this.foldersById.get(folderId);

    if (!folder) {
      throw new Error(`Unknown folder: ${folderId}`);
    }

    const { pagesInSubtree } = this.relocateFolderSubtree(folderId, path, parentId);

    const relocated = this.foldersById.get(folderId)!;
    const corrected: Folder = {
      ...relocated,
      metadata: { ...relocated.metadata, ...metadata },
    };

    this.foldersById.set(folderId, corrected);
    this.foldersByPath.set(corrected.path, corrected);

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
   * The one implementation of "relocate a folder and its entire subtree to
   * a new path/parentId" — moveFolder() and archiveFolder() both call this,
   * differing only in what (if anything) they do to the target folder's own
   * metadata afterward. Collision checks, path-map updates, and id
   * stability for every descendant folder/page are identical for a plain
   * move and an archive-relocation (ADR-026 §0: "the persistence...
   * exactly what Vault.moveFolder()'s cascade already does").
   *
   * Unlike moveFolder(), this performs no same-destination no-op check —
   * callers that need one (moveFolder()) perform it themselves before
   * calling in, since archiveFolder() always expects a genuine relocation
   * into Archive/.
   */
  private relocateFolderSubtree(
    folderId: string,
    path: string,
    parentId: string | null
  ): {
    readonly descendantFolders: readonly Folder[];
    readonly pagesInSubtree: readonly Page[];
    readonly resourcesInSubtree: readonly VaultResource[];
  } {
    const folder = this.foldersById.get(folderId)!;
    const oldPrefix = folder.path;

    const selfOccupant = this.getFolderByPathCaseInsensitive(path);

    if (selfOccupant && selfOccupant.id !== folderId) {
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
      const occupant = this.getFolderByPathCaseInsensitive(nextPath);

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
      const occupant = this.getPageByPathCaseInsensitive(nextPath);

      if (occupant && occupant.id !== id && !pagePathUpdates.has(occupant.id)) {
        throw new Error(`Path already in use by another page: ${nextPath}`);
      }
    }

    // The resource-scoped counterpart to pagesInSubtree/pagePathUpdates
    // above — a resource nested inside this folder subtree must relocate
    // along with it, the same rule a nested page already followed. Added
    // once VaultResource needed to participate in the same cascade
    // Page/Folder already did (previously this method only knew about
    // folders/pages, silently leaving a nested resource's path/parentId
    // stale after its containing folder moved/archived/restored).
    const resourcesInSubtree = [...this.resourcesById.values()].filter(
      (resource) => resource.parentId !== null && subtreeFolderIds.has(resource.parentId)
    );

    const resourcePathUpdates = new Map<string, string>();

    for (const resource of resourcesInSubtree) {
      resourcePathUpdates.set(resource.id, path + resource.path.slice(oldPrefix.length));
    }

    for (const [id, nextPath] of resourcePathUpdates) {
      const occupant = this.getResourceByPathCaseInsensitive(nextPath);

      if (occupant && occupant.id !== id && !resourcePathUpdates.has(occupant.id)) {
        throw new Error(`Path already in use by another resource: ${nextPath}`);
      }
    }

    for (const descendant of descendantFolders) {
      this.foldersByPath.delete(descendant.path);
    }

    this.foldersByPath.delete(folder.path);

    for (const page of pagesInSubtree) {
      this.pagesByPath.delete(page.path);
    }

    for (const resource of resourcesInSubtree) {
      this.resourcesByPath.delete(resource.path);
    }

    // name is recomputed from the new path's filename — until ADR-024, this
    // method was only ever exercised by FolderOperations.create() (which
    // never changes an existing folder's basename), so a change to the
    // trailing path segment (a rename) never had a live caller to surface
    // this. moveFolder() covers both move and rename — the unified
    // 'move-folder' Gate kind calls it with a changed basename for a
    // rename, an unchanged one for a pure move, or both at once.
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
      // Same rule replacePage()/updatePagePath() already apply to a
      // directly-moved page: type is derived from the final path
      // (resolvePageType), never carried over from the pre-move value.
      // Without this, a Daily Note dragged out of Daily Notes/ only via
      // its ancestor folder moving (moveFolder/archiveFolder/restoreFolder
      // all share this cascade) would keep stale type: 'daily-note'.
      const updatedPage: Page = {
        ...page,
        path: nextPath,
        type: this.resolvePageType(nextPath),
      };

      this.pagesById.set(page.id, updatedPage);
      this.pagesByPath.set(nextPath, updatedPage);
    }

    for (const resource of resourcesInSubtree) {
      const nextPath = resourcePathUpdates.get(resource.id)!;
      const updatedResource: VaultResource = {
        ...resource,
        path: nextPath,
        name: VaultPath.filename(nextPath),
      };

      this.resourcesById.set(resource.id, updatedResource);
      this.resourcesByPath.set(nextPath, updatedResource);
    }

    return { descendantFolders, pagesInSubtree, resourcesInSubtree };
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

    const { folders: descendantFolders, pages: pagesInSubtree, resources: resourcesInSubtree } =
      this.getDescendantFoldersAndPages(folderId);

    for (const page of pagesInSubtree) {
      this.pagesById.delete(page.id);
      this.pagesByPath.delete(page.path);
    }

    for (const resource of resourcesInSubtree) {
      this.resourcesById.delete(resource.id);
      this.resourcesByPath.delete(resource.path);
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
    const occupant = this.getPageByPathCaseInsensitive(path);

    if (occupant && occupant.id !== exceptPageId) {
      throw new Error(`Path already in use by another page: ${path}`);
    }
  }

  /**
   * The single source of truth for a page's Daily Note vs. Note role: a
   * pure function of its current path, never persisted frontmatter. Called
   * by every Vault mutation that changes a page's identity/location after
   * construction (replacePage, updatePagePath) — not by addPage, whose
   * only production callers already pass a Page PageBuilder just built
   * with the correct type, and not by the constructor's initial
   * population, which is exactly that same PageBuilder output.
   */
  private resolvePageType(path: string): Page['type'] {
    return isDailyNotePath(this.root, path) ? 'daily-note' : 'note';
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

  /**
   * Case-insensitive counterpart to getPageByPath() — same reasoning as
   * getFolderByPathCaseInsensitive() above, for a page's own collision
   * checks (PagePathResolver.createNotePath, MoveService's resolvers,
   * PageOperations.canRename).
   */
  getPageByPathCaseInsensitive(path: string): Page | undefined {
    for (const page of this.pagesByPath.values()) {
      if (VaultPath.equalsCaseInsensitive(page.path, path)) {
        return page;
      }
    }

    return undefined;
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
