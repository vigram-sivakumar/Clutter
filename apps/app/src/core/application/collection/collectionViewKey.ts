import type { ActiveView } from '../../workspace/Workspace';

/**
 * A stable, opaque string identifying "which collection" a persisted
 * `CollectionViewConfigStore` entry belongs to — never a new identity
 * scheme, always derived from an identity `Workspace`'s `ActiveView`/
 * `FilteredView` (ADR-022/023) already carries:
 *
 *  - A real folder (including Archive, a real reserved `Folder`) →
 *    `folder:<folder.id>`.
 *  - Workspace-root / Favorites — query-defined filtered views with no
 *    backing `Folder` (ADR-022) → `view:workspace` / `view:favorites`.
 *  - A tag — a filtered view parameterized by name → `tag:<tagName>`.
 *
 * The `tasks-*` and `assets` filtered views are deliberately out of scope:
 * neither renders `CollectionViewMenu`/`CollectionBody` (PageHost.tsx
 * dispatches them to `TasksCollectionBody`/`AssetsCollectionBody` instead),
 * so there is no Layout/Properties/Sort configuration to key for them.
 */
export type CollectionViewKey = string;

const COLLECTION_VIEW_KEY_PREFIX = {
  folder: 'folder:',
  filteredView: 'view:',
  tag: 'tag:',
} as const;

export function collectionViewKeyForFolder(folderId: string): CollectionViewKey {
  return `${COLLECTION_VIEW_KEY_PREFIX.folder}${folderId}`;
}

export function collectionViewKeyForFilteredView(
  kind: 'workspace' | 'favorites'
): CollectionViewKey {
  return `${COLLECTION_VIEW_KEY_PREFIX.filteredView}${kind}`;
}

/**
 * `tagName` is always the exact string a tag's `FilteredView.tagName`
 * currently holds — the same canonical name `TagOperations.rename()` uses
 * as its own identity — never re-normalized here. Exported so
 * `TagOperations.rename()` can move a renamed tag's persisted entry to its
 * new key using the exact same derivation, rather than reimplementing the
 * `tag:` prefix convention.
 */
export function collectionViewKeyForTag(tagName: string): CollectionViewKey {
  return `${COLLECTION_VIEW_KEY_PREFIX.tag}${tagName}`;
}

/**
 * Derives the current collection's key from `Workspace.activeView`, or
 * `undefined` when the active view isn't a collection with configurable
 * Layout/Properties/Sort (a page, or an out-of-scope filtered view — see
 * this module's own doc comment).
 */
export function deriveCollectionViewKey(
  activeView: ActiveView | null
): CollectionViewKey | undefined {
  if (!activeView) {
    return undefined;
  }

  if (activeView.type === 'folder') {
    return collectionViewKeyForFolder(activeView.id);
  }

  if (activeView.type === 'filtered-view') {
    const { view } = activeView;

    if (view.kind === 'workspace' || view.kind === 'favorites') {
      return collectionViewKeyForFilteredView(view.kind);
    }

    if (view.kind === 'tag') {
      return collectionViewKeyForTag(view.tagName);
    }
  }

  return undefined;
}
