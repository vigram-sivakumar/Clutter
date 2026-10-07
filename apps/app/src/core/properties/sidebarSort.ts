/**
 * How the notes sidebar orders one folder's children — a dependency-free leaf, shared by the
 * persistence store, the menu and the tree. One key at a time, never a combination.
 *
 * It follows the collection views' sort conventions (`collectionSort.ts`): `direction` names the
 * arrow shown. 'down' is A→Z for Name, newest first for the dates, and folders → notes → files
 * for Kind; 'up' is the reverse. It is its own small model rather than more collection
 * properties because Kind is an arrangement of the list's groups, not a property a collection
 * can show, and the sidebar offers a shorter list than a collection's Sort by. The labels are the
 * collection views' own (`propertyLabel`); Kind has no collection counterpart.
 */
import { propertyLabel } from './collectionProperties';
import type { SortDirection } from './collectionSort';

export type SidebarSortKey = 'name' | 'kind' | 'created' | 'updated';

export interface SidebarSort {
  readonly key: SidebarSortKey;
  readonly direction: SortDirection;
}

/** The keys in the order the sidebar menu lists them, with their labels. */
export const SIDEBAR_SORT_OPTIONS: readonly { readonly key: SidebarSortKey; readonly label: string }[] = [
  { key: 'name', label: propertyLabel('name') },
  { key: 'kind', label: 'Kind' },
  { key: 'created', label: propertyLabel('created') },
  { key: 'updated', label: propertyLabel('updated') },
];

/** What a folder without a chosen sort shows as active. */
export const DEFAULT_SIDEBAR_SORT: SidebarSort = { key: 'name', direction: 'down' };

export function isSidebarSortKey(value: unknown): value is SidebarSortKey {
  return SIDEBAR_SORT_OPTIONS.some((option) => option.key === value);
}
