import type { Folder } from '../models/Folder';
import type { Page } from '../models/Page';
import type { VaultResource } from '../models/VaultResource';
import type { Vault } from '../models/Vault';

// Vault.foldersById/pagesById (Maps) iterate in insertion order, which
// reflects startup scan order (raw OS readdir order) for scanned entries
// and arrival order (creation, or fs-watcher discovery for anything
// reconciled in — e.g. Duplicate's filesystem copy) for anything added
// mid-session — none of that is a meaningful display order. VaultQuery is
// the one place order is defined, applied uniformly regardless of how or
// when a folder/page entered the Vault.
//
// 'title' is today's only mode — natural/alphanumeric-by-name, now named
// and swappable rather than inlined, so a future mode (e.g. a planned
// "Type: folders first, then notes" mode, driven by a Sort control) is an
// additive entry here plus a new FolderSortMode member, not a rewrite of
// these methods. Which mode is active is caller-owned (eventually
// Workspace, as user-facing view state) — VaultQuery only owns how each
// named mode compares two entries.
export type FolderSortMode = 'title';

// Natural/alphanumeric compare: embedded digit runs compare by numeric
// value, not lexicographically, so "Project 2" sorts before "Project 10"
// and "Project copy 2" before "Project copy 10" — matching Finder, unlike
// plain localeCompare.
function compareByName(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name, undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

const FOLDER_SORT_COMPARATORS: Record<
  FolderSortMode,
  (a: Folder, b: Folder) => number
> = {
  title: compareByName,
};

function sortFolders(folders: Folder[], sortMode: FolderSortMode): Folder[] {
  return folders.sort(FOLDER_SORT_COMPARATORS[sortMode]);
}

// Pages have no sort-mode concept yet (unlike folders) — 'title' natural
// order is the only defined behavior, applied unconditionally. When a Sort
// control is introduced, this becomes a PageSortMode-driven lookup mirroring
// FOLDER_SORT_COMPARATORS, not a new comparator implementation.
function sortPages(pages: Page[]): Page[] {
  return pages.sort(compareByName);
}

// Same natural-by-name ordering as sortPages, applied to resources — no
// sort-mode concept for resources either, same rationale as pages above.
function sortResources(resources: VaultResource[]): VaultResource[] {
  return resources.sort(compareByName);
}

export class VaultQuery {
  constructor(private readonly vault: Vault) {}

  public getRootFolders(sortMode: FolderSortMode = 'title'): Folder[] {
    return sortFolders(
      Array.from(this.vault.folders()).filter(
        (folder) => folder.parentId === null
      ),
      sortMode
    );
  }

  public getChildFolders(
    parentId: string,
    sortMode: FolderSortMode = 'title'
  ): Folder[] {
    return sortFolders(
      Array.from(this.vault.folders()).filter(
        (folder) => folder.parentId === parentId
      ),
      sortMode
    );
  }

  public getChildPages(parentId: string): Page[] {
    return sortPages(
      Array.from(this.vault.pages()).filter(
        (page) => page.parentId === parentId
      )
    );
  }

  // Same natural-by-name ordering as getChildFolders, applied to root
  // pages — see sortPages/compareByName above.
  public getRootPages(): Page[] {
    return sortPages(
      Array.from(this.vault.pages()).filter((page) => page.parentId === null)
    );
  }

  // Mirrors getChildPages exactly — same filter shape, same sort — for
  // VaultResource (image/pdf) instead of Page.
  public getChildResources(parentId: string): VaultResource[] {
    return sortResources(
      Array.from(this.vault.resources()).filter(
        (resource) => resource.parentId === parentId
      )
    );
  }

  // Mirrors getRootPages exactly, for VaultResource instead of Page.
  public getRootResources(): VaultResource[] {
    return sortResources(
      Array.from(this.vault.resources()).filter(
        (resource) => resource.parentId === null
      )
    );
  }

  /**
   * Every supported resource anywhere in the vault, regardless of parent
   * folder — the "Assets" logical collection (every VaultResource, not
   * just the ones physically inside the managed Assets/ storage folder).
   * Unlike getChildResources/getRootResources, this is not folder-scoped
   * at all; it's the vault-wide counterpart, same sort as the others.
   */
  public getAllResources(): VaultResource[] {
    return sortResources(Array.from(this.vault.resources()));
  }

  public getFavoriteFolders(): Folder[] {
    return Array.from(this.vault.folders()).filter(
      (folder) =>
        folder.metadata.favorite && folder.metadata.status !== 'archived'
    );
  }

  public getFavoritePages(): Page[] {
    return Array.from(this.vault.pages()).filter(
      (page) => page.metadata.favorite && page.metadata.status !== 'archived'
    );
  }

  public getArchivedPages(): Page[] {
    return Array.from(this.vault.pages()).filter(
      (page) => page.metadata.status === 'archived'
    );
  }

  // Exact match against the tag's stored (as-typed) name — a tag
  // collection view is always opened from a known Tag (e.g. a sidebar
  // click), so the caller already has the exact casing tags() preserves.
  public getPagesByTag(name: string): Page[] {
    return Array.from(this.vault.pages()).filter((page) =>
      page.analysis.tags.some((occurrence) => occurrence.name === name)
    );
  }
}
