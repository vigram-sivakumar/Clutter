import type { Page } from './Page';
import type { Folder } from './Folder';
import type { Tag } from './Tag';
import type { Task } from './Task';
import type { Link } from './Link';
import type { Embed } from './Embed';

export class Vault {
  private readonly pagesById = new Map<string, Page>();
  private readonly foldersById = new Map<string, Folder>();
  private readonly tagsByName = new Map<string, Tag>();
  // TODO(v2): These collections are derived from pages. Consider moving
  // them into dedicated indexes or a graph layer if they become large or
  // require more advanced querying.
  private readonly taskList = new Array<Task>();
  private readonly linkList = new Array<Link>();
  private readonly embedList = new Array<Embed>();

  // TODO(v2): Replace the growing constructor parameter list with a
  // `VaultCollections` object once additional derived collections
  // (attachments, graph, templates, etc.) are introduced.
  constructor(
    public readonly root: string,
    pages: Iterable<Page>,
    folders: Iterable<Folder>,
    tags: Iterable<Tag>,
    taskCollection: Iterable<Task>,
    linkCollection: Iterable<Link>,
    embedCollection: Iterable<Embed>
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

  *tasks(): IterableIterator<Task> {
    yield* this.taskList;
  }

  // TODO(v2): Keep the Vault focused on owning data. Relationship queries
  // such as backlinks, outgoing links, graph traversal, and unlinked
  // mentions should live in a dedicated graph/index layer.
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
