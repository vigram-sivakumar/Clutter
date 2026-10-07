import { AppIcon } from '@shared/icon';
import { SIDEBAR_SORT_OPTIONS } from '@core/properties/sidebarSort';

import type { ResourceActionDefinition } from './resourceActionTypes';

/** The id prefix of a Sort by row (`sort:<property id>`), so a row's handler can tell it from an action. */
export const SORT_MENU_ID_PREFIX = 'sort:';

/**
 * A folder's Sort by: one row that swaps the menu for the sort choices (OverflowMenu's `panel`). One
 * key at a time; the active key shows the direction arrow, and picking it again flips the direction
 * (the same rule as the collection views' Configure menu). Present only when the surface supplies a
 * `sort` — and, by the surface profiles, only on the sidebar.
 */
export const FOLDER_SORT_BY: ResourceActionDefinition = {
  id: 'sort-by',
  group: 'view',
  order: 10,
  label: 'Sort by',
  icon: 'arrowDown',
  availability: (context) => (context.sort ? 'enabled' : 'hidden'),
  panel: (context) => ({
    title: 'Sort by',
    items: SIDEBAR_SORT_OPTIONS.map(({ key, label }) => {
      const isActive = context.sort?.key === key;
      return {
        id: `${SORT_MENU_ID_PREFIX}${key}`,
        label,
        icon: isActive ? 'tick' : undefined,
        reserveIconSpace: true,
        trailing: isActive ? (
          <AppIcon
            icon={context.sort?.direction === 'down' ? 'arrowDown' : 'arrowUp'}
            className="menu__item-indicator"
          />
        ) : undefined,
      };
    }),
  }),
};
