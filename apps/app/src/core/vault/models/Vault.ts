import type { Page } from './Page';
import type { Folder } from './Folder';
import type { Tag } from './Tag';
import type { TaskOccurrence } from './occurrences/TaskOccurrence';
import type { Embed } from './Embed';
import type { KnowledgeGraph } from './graph/KnowledgeGraph';

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
  // Canonical lookup by the page's current relative filesystem path.
  // Unlike page IDs, paths may change when pages are renamed or moved.
  private readonly pagesById = new Map<string, Page>();
  private readonly pagesByPath = new Map<string, Page>();
  private readonly foldersById = new Map<string, Folder>();
  private readonly tagsByName = new Map<string, Tag>();
  // Vault-wide projections derived from page analysis.
  //
  // Page.analysis is the canonical owner of extracted semantics. These
  // collections provide efficient vault-wide traversal and may eventually be
  // replaced by dedicated indexes or graph-backed query structures.
  private readonly taskList = new Array<TaskOccurrence>();
  private readonly embedList = new Array<Embed>();

  constructor(
    public readonly root: string,
    pages: Iterable<Page>,
    folders: Iterable<Folder>,
    tags: Iterable<Tag>,
    tasks: Iterable<TaskOccurrence>,
    embeds: Iterable<Embed>,
    public readonly knowledgeGraph: KnowledgeGraph
  ) {
    for (const folder of folders) {
      if (this.foldersById.has(folder.id)) {
        throw new Error(`Duplicate folder ID: ${folder.id}`);
      }

      this.foldersById.set(folder.id, folder);
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

  getPage(id: string): Page | undefined {
    return this.pagesById.get(id);
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
