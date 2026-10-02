import { useState } from 'react';

import { OverflowMenu } from '@components/menu/OverflowMenu';
import type { OverflowMenuItemConfig } from '@components/menu/OverflowMenu';

import type { PropertyActions } from './PropertyList.types';

/**
 * A Property's menu: the vertical-dots button shown in its icon's place
 * while its name is hovered (PropertyList.css), opening Hide and Clear,
 * then — after a divider — Delete. Only the actions the adapter supplies
 * are listed, the divider only when something precedes Delete, and
 * nothing at all renders when there are none.
 */
export function PropertyMenu({
  name,
  actions,
}: {
  /** The Property's name — in the button's accessible label. */
  name: string;
  actions: PropertyActions;
}) {
  const [open, setOpen] = useState(false);

  const items: OverflowMenuItemConfig[] = [];

  if (actions.onHide) {
    items.push({ id: 'hide', label: 'Hide', icon: 'hide' });
  }

  if (actions.onClear) {
    items.push({ id: 'clear', label: 'Clear', icon: 'dismiss' });
  }

  if (actions.onDelete) {
    // Destructive, so set apart — the same divider-before-Delete
    // convention every other menu here uses.
    items.push({ id: 'delete', label: 'Delete', icon: 'trash', separatorBefore: items.length > 0 });
  }

  return (
    <OverflowMenu
      items={items}
      open={open}
      onOpenChange={setOpen}
      side="bottom"
      alignment="start"
      buttonProps={{ className: 'property__menu-button', 'aria-label': `${name} actions` }}
      onSelect={(id) => {
        if (id === 'hide') {
          actions.onHide?.();
        } else if (id === 'clear') {
          actions.onClear?.();
        } else if (id === 'delete') {
          actions.onDelete?.();
        }
      }}
    />
  );
}
