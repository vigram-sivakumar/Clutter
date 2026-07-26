import type { Page } from './Page';
import type { Folder } from './Folder';
import type { Tag } from './Tag';
import type { TaskOccurrence } from './occurrences/TaskOccurrence';
import type { Link } from './Link';
import type { Embed } from './Embed';
import type { KnowledgeGraph } from './graph/KnowledgeGraph';
import { DocumentRegistry } from '../../engine/DocumentRegistry';
import type { DocumentSession } from '../../engine/DocumentSession';

export class Vault {
  private readonly pagesById = new Map<string, Page>();
  private readonly foldersById = new Map<string, Folder>();
  private readonly tagsByName = new Map<string, Tag>();
  // Vault-wide projections derived from page analysis.
  //
  // Page.analysis is the canonical owner of extracted semantics. These
  // collections provide efficient vault-wide traversal and may eventually be
  // replaced by dedicated indexes or graph-backed query structures.
  private readonly taskList = new Array<TaskOccurrence>();
  private readonly linkList = new Array<Link>();
  private readonly embedList = new Array<Embed>();

  /**
   * Manages the active document sessions for this Vault.
   *
   * A page becomes editable only after it is opened through the
   * DocumentRegistry.
   */
  private readonly documentRegistry = new DocumentRegistry();

  // TODO(v2): Replace the growing constructor parameter list with a
  // `VaultCollections` object once additional derived collections
  // (attachments, templates, saved searches, etc.) are introduced.
  constructor(
    public readonly root: string,
    pages: Iterable<Page>,
    folders: Iterable<Folder>,
    tags: Iterable<Tag>,
    taskCollection: Iterable<TaskOccurrence>,
    linkCollection: Iterable<Link>,
    embedCollection: Iterable<Embed>,
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

    for (const task of taskCollection) {
      this.taskList.push(task);
    }

    for (const link of linkCollection) {
      this.linkList.push(link);
    }

    for (const embed of embedCollection) {
      this.embedList.push(embed);
    }

    for (const page of pages) {
      if (this.pagesById.has(page.id)) {
        throw new Error(`Duplicate page ID: ${page.id}`);
      }

      this.pagesById.set(page.id, page);
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

  // Relationship queries (backlinks, outgoing links, graph traversal,
  // unlinked mentions, etc.) belong to derived projections such as the
  // knowledge graph rather than the Vault itself.
  *links(): IterableIterator<Link> {
    yield* this.linkList;
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

  get linkCount(): number {
    return this.linkList.length;
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
   * Opens a page for editing.
   *
   * Returns the authoritative DocumentSession for the page.
   */
  openPage(id: string): DocumentSession {
    const page = this.getPage(id);

    if (!page) {
      throw new Error(`Page not found: ${id}`);
    }

    return this.documentRegistry.open(page);
  }

  /**
   * Returns the active document session for a page.
   *
   * Undefined is returned when the page is not currently open.
   */
  getOpenPage(id: string): DocumentSession | undefined {
    return this.documentRegistry.get(id);
  }

  /**
   * Closes an open page.
   *
   * If the page is not currently open, this operation has no effect.
   */
  closePage(id: string): void {
    this.documentRegistry.close(id);
  }

  /**
   * Returns true if the page currently has an active document session.
   */
  isPageOpen(id: string): boolean {
    return this.documentRegistry.isOpen(id);
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
