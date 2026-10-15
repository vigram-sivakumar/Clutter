/**
 * How the notes sidebar orders one level's children — a dependency-free leaf, shared by the persistence
 * store, the menu and the tree. One key at a time, never a combination. Notes and folders are ONE sibling
 * sequence under every key (files follow it).
 *
 *  - name    — alphabetical; `direction` 'down' is A→Z.
 *  - created — by creation time; 'up' is oldest first (the menu's default), 'down' newest first.
 *  - updated — by last edit; 'down' is most recently edited first (the menu's default).
 *  - manual  — the user's own order (`sidebarOrder`); no direction.
 *  - kind    — retired (it grouped folders and notes); still read from older files, and drawn as Name.
 *
 * `direction` follows the collection views' sort conventions (`collectionSort.ts`): it names the arrow
 * shown. A folder has no created/edited date (`FolderMetadata` has none), so under those two it sorts after
 * the dated notes, by name.
 */
import type { SortDirection } from './collectionSort';

export type SidebarSortKey = 'name' | 'kind' | 'created' | 'updated' | 'manual';

export interface SidebarSort {
  readonly key: SidebarSortKey;
  readonly direction: SortDirection;
}

/**
 * The keys the sidebar menu offers, in order, with their labels. Notes and folders are one sibling
 * sequence under every one of them. `kind` (which used to group folders and notes) is no longer offered; a
 * stored `kind` is still read, as Name.
 */
export const SIDEBAR_SORT_OPTIONS: readonly { readonly key: SidebarSortKey; readonly label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'created', label: 'Created time' },
  { key: 'updated', label: 'Last edited' },
  // The user's own arrangement (`sidebarOrder`); it has no direction.
  { key: 'manual', label: 'Manual' },
];

/**
 * The direction a key starts in when picked: A→Z for Name, oldest first for Created time (`up`, since `down`
 * is newest first for dates), most recently edited first for Last edited.
 */
export function defaultSidebarSortDirection(key: SidebarSortKey): SortDirection {
  return key === 'created' ? 'up' : 'down';
}

/** What a folder without a chosen sort shows as active. */
export const DEFAULT_SIDEBAR_SORT: SidebarSort = { key: 'name', direction: 'down' };

export function isSidebarSortKey(value: unknown): value is SidebarSortKey {
  return SIDEBAR_SORT_OPTIONS.some((option) => option.key === value);
}

/**
 * The id one sibling has in a level's manual order (`CollectionViewConfig.sidebarOrder`): kind-prefixed, so
 * a note and a folder that happen to share an id never collide. Files are not part of manual ordering.
 */
export function sidebarOrderId(kind: 'folder' | 'note', id: string): string {
  return `${kind === 'folder' ? 'f' : 'n'}:${id}`;
}

/** A stored order read defensively: strings only, first occurrence of each id kept. `undefined` when nothing valid remains. */
export function normalizeSidebarOrder(raw: unknown): readonly string[] | undefined {
  if (!Array.isArray(raw)) {
    return undefined;
  }

  const seen = new Set<string>();
  const order: string[] = [];

  for (const entry of raw) {
    if (typeof entry === 'string' && entry !== '' && !seen.has(entry)) {
      seen.add(entry);
      order.push(entry);
    }
  }

  return order.length > 0 ? order : undefined;
}
