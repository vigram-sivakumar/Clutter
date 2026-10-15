import { useState } from 'react';

import { OverflowMenu } from '@components/menu/OverflowMenu';
import type { OverflowMenuItemConfig } from '@components/menu/OverflowMenu';

import type { PropertyActions } from './PropertyList.types';

/**
 * A Property's menu: the horizontal-dots button shown in its icon's place
 * while its name is hovered (PropertyList.css). It lists the actions the
 * adapter supplies — Move up / Move down (when the row can be reordered), Clear, then after a divider Remove (a system
 * Property, unlisted but kept) or Delete (a custom one, gone for good) —
 * the divider only when something precedes it, and nothing at all renders
 * when there are none.
 */
export function PropertyMenu({
  name,
  actions,
  move,
}: {
  /** The Property's name — in the button's accessible label. */
  name: string;
  actions: PropertyActions;
  /**
   * Move up / Move down — the keyboard and menu way to do what dragging the label does. Present only
   * when the row can be reordered; a direction that has nowhere to go (the first row's up, the last
   * row's down) is `null` and shown disabled.
   */
  move?: { up: (() => void) | null; down: (() => void) | null };
}) {
  const [open, setOpen] = useState(false);

  const items: OverflowMenuItemConfig[] = [];

  if (move) {
    items.push({ id: 'move-up', label: 'Move up', icon: 'arrowUp', disabled: move.up === null });
    items.push({ id: 'move-down', label: 'Move down', icon: 'arrowDown', disabled: move.down === null });
  }

  if (actions.onClear) {
    items.push({ id: 'clear', label: 'Clear', icon: 'dismiss', separatorBefore: items.length > 0 });
  }

  if (actions.onRemove) {
    items.push({ id: 'remove', label: 'Remove', icon: 'trash', variant: 'danger', separatorBefore: items.length > 0 });
  }

  if (actions.onDelete) {
    // Destructive, so set apart — the same divider-before-Delete
    // convention every other menu here uses.
    items.push({ id: 'delete', label: 'Delete', icon: 'trash', variant: 'danger', separatorBefore: items.length > 0 });
  }

  return (
    <OverflowMenu
      items={items}
      open={open}
      onOpenChange={setOpen}
      side="bottom"
      alignment="start"
      icon="moreHorizontal"
      buttonProps={{ className: 'property__menu-button', 'aria-label': `${name} actions` }}
      onSelect={(id) => {
        if (id === 'move-up') {
          move?.up?.();
        } else if (id === 'move-down') {
          move?.down?.();
        } else if (id === 'clear') {
          actions.onClear?.();
        } else if (id === 'remove') {
          actions.onRemove?.();
        } else if (id === 'delete') {
          actions.onDelete?.();
        }
      }}
    />
  );
}
