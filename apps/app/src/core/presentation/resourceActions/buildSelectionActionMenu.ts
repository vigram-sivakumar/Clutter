import type { OverflowMenuItemConfig } from '@components/menu/OverflowMenu';

import { buildMenuFromDefinitions } from './buildResourceActionMenu';
import { SELECTION_ACTIONS } from './resourceActionDefinitions';
import type { ResourceActionSurface } from './resourceActionSurfaces';

/** The selection menu's actions that act on the items themselves: each is offered only when every selected item supports it. */
export const SELECTION_ITEM_ACTION_IDS: readonly string[] = ['move-to', 'toggle-favorite', 'archive', 'restore', 'delete'];

export interface SelectionMenuFacts {
  /** How many items are selected — the menu's title. */
  readonly count: number;
  /** How many eligible items there are in all — what the selection is measured against (none, some or all selected). */
  readonly total: number;
  /** The item actions (of `SELECTION_ITEM_ACTION_IDS`) that EVERY selected item supports. */
  readonly supported: ReadonlySet<string>;
  /** Every selected item is already a favorite: the favorite action then reads Remove from favorites. */
  readonly allFavorite: boolean;
}

/**
 * The menu for a Collection View selection, built by the same builder as every resource's menu (ADR-048) from
 * the shared definitions: Select all first, then — only those every selected item supports —
 * Move to, Add to / Remove from favorites, Move to trash, Restore and Delete, with the dividers the global groups give. The
 * first item carries the selection count as its group title ("3 selected").
 */
export function buildSelectionActionMenu(
  { count, total, supported, allFavorite }: SelectionMenuFacts,
  surface: ResourceActionSurface = 'context'
): OverflowMenuItemConfig[] {
  const definitions = SELECTION_ACTIONS.map((definition) => ({
    ...definition,
    availability: () =>
      !SELECTION_ITEM_ACTION_IDS.includes(definition.id) || supported.has(definition.id)
        ? ('enabled' as const)
        : ('hidden' as const),
  }));
  const menu = buildMenuFromDefinitions(definitions, { isFavorite: allFavorite, selectionState: count <= 0 ? 'none' : count < total ? 'some' : 'all' }, surface);

  return menu.map((item, index) => (index === 0 ? { ...item, groupTitle: `${count} selected` } : item));
}
