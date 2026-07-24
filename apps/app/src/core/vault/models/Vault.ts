import type { Page } from './Page';
import type { Folder } from './Folder';

export class Vault {
  private readonly pagesById = new Map<string, Page>();
  private readonly foldersById = new Map<string, Folder>();

  constructor(
    public readonly root: string,
    pages: Iterable<Page>,
    folders: Iterable<Folder>
  ) {
    for (const folder of folders) {
      if (this.foldersById.has(folder.id)) {
        throw new Error(`Duplicate folder ID: ${folder.id}`);
      }

      this.foldersById.set(folder.id, folder);
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
  get folderCount(): number {
    return this.foldersById.size;
  }

  getPage(id: string): Page | undefined {
    return this.pagesById.get(id);
  }
  *pages(): IterableIterator<Page> {
    yield* this.pagesById.values();
  }
  get pageCount(): number {
    return this.pagesById.size;
  }
}
