import type { Page } from './Page';
import type { Folder } from './Folder';
import type { Tag } from './Tag';
import type { TaskOccurrence } from './occurrences/TaskOccurrence';
import type { Embed } from './Embed';
import type { KnowledgeGraph } from './graph/KnowledgeGraph';
import type { VaultProjectionBuilder } from '../knowledge/VaultProjectionBuilder';

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
  private readonly embedList = new Array<Embed>();
  private _knowledgeGraph: KnowledgeGraph;

  private readonly listeners = new Set<VaultChangeListener>();

  constructor(
    public readonly root: string,
    pages: Iterable<Page>,
    folders: Iterable<Folder>,
    tags: Iterable<Tag>,
    tasks: Iterable<TaskOccurrence>,
    embeds: Iterable<Embed>,
    knowledgeGraph: KnowledgeGraph,
    private readonly projectionBuilder: VaultProjectionBuilder
  ) {
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

    for (const embed of embeds) {
      this.embedList.push(embed);
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

  *folders(): IterableIterator<Folder> {
    yield* this.foldersById.values();
  }
  *tags(): IterableIterator<Tag> {
    yield* this.tagsByName.values();
  }

  *tasks(): IterableIterator<TaskOccurrence> {
    yield* this.taskList;
  }

  *embeds(): IterableIterator<Embed> {
    yield* this.embedList;
  }

  get tagCount(): number {
    return this.tagsByName.size;
  }

  get taskCount(): number {
    return this.taskList.length;
  }

  get embedCount(): number {
    return this.embedList.length;
  }

  get folderCount(): number {
    return this.foldersById.size;
  }

  get knowledgeGraph(): KnowledgeGraph {
    return this._knowledgeGraph;
  }

  /**
   * Rebuilds tags, tasks, embeds, and the knowledge graph from the current
   * set of Pages.
   *
   * Projections are disposable and always fully reconstructable from Pages,
   * the authoritative source of truth, so every mutation rebuilds them from
   * scratch rather than patching them incrementally in place. This trades
   * O(n) work per mutation for a guarantee that projections can never drift
   * from the Pages they were derived from.
   */
  private refreshProjections(): void {
    const projections = this.projectionBuilder.build(this.pagesById.values());

    this.tagsByName.clear();
    for (const tag of projections.tags) {
      this.tagsByName.set(tag.name, tag);
    }

    this.taskList.length = 0;
    this.taskList.push(...projections.tasks);

    this.embedList.length = 0;
    this.embedList.push(...projections.embeds);

    this._knowledgeGraph = projections.knowledgeGraph;
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
        candidate.path.startsWith(`${oldPrefix}/`)
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

    const movedFolder: Folder = {
      ...folder,
      path,
      parentId,
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
