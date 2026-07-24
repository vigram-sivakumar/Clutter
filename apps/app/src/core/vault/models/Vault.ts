import type { Page } from './Page';
import type { Folder } from './Folder';
import type { Tag } from './Tag';
import type { Task } from './Task';

export class Vault {
  private readonly pagesById = new Map<string, Page>();
  private readonly foldersById = new Map<string, Folder>();
  private readonly tagsByName = new Map<string, Tag>();
  private readonly taskList = new Array<Task>();

  constructor(
    public readonly root: string,
    pages: Iterable<Page>,
    folders: Iterable<Folder>,
    tags: Iterable<Tag>,
    taskCollection: Iterable<Task>
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

  get tagCount(): number {
    return this.tagsByName.size;
  }

  get taskCount(): number {
    return this.taskList.length;
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
