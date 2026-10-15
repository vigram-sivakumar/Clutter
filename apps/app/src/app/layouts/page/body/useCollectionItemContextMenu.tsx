import { useCallback, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';

import type { CollectionEntryModel } from '@features/collection/page/CollectionEntryModel';

import type { ResourceTopBarActionsProps } from '../topbar/ResourceTopBarActions';
import { ResourceContextMenu, type ContextMenuPoint } from './ResourceContextMenu';

/**
 * Resolves a Collection View entry to its More actions menu (the topbar's, for that entry's resource),
 * or `null` when it has none. Its presence is the capability gate, like `moveDrag`: a collection that
 * passes none leaves its entries without a right-click menu (the native menu is still suppressed).
 */
export type CollectionItemMenuResolver<T extends CollectionMenuItem = CollectionEntryModel> = (
  item: T
) => ResourceTopBarActionsProps | null;

/** Anything a collection draws as an item: a note or folder entry, or an asset. Only its `id` is read here. */
export interface CollectionMenuItem {
  readonly id: string;
}

export type CollectionContextMenuEntryProps = {
  readonly onContextMenu: (event: ReactMouseEvent<HTMLElement>) => void;
  readonly 'data-context-entry': string;
  /**
   * Set on the entry whose menu is open: the entry stays in its hover appearance for as long as the menu
   * does (the CSS shares the `:hover` rule), wherever the pointer is. Appearance only — selection is untouched.
   */
  readonly 'data-context-menu-open'?: 'true';
};

/** A keyboard-invoked context menu (the Menu key, Shift+F10) has no pointer: open at the entry's corner. */
function pointFor(event: ReactMouseEvent<HTMLElement>): ContextMenuPoint {
  if (event.clientX === 0 && event.clientY === 0 && event.detail === 0) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: rect.left, y: rect.bottom };
  }
  return { x: event.clientX, y: event.clientY };
}

/**
 * Right-click on a Collection View entry. The action target is the entry that was right-clicked — its id
 * is captured with the event and the menu is resolved from THAT entry — never the page's open note or
 * any other selection, which a right-click does not change. The same hook-shape as
 * `useCollectionMoveDrag`: per-entry props to spread, plus one `overlay` to render once.
 */
export function useCollectionItemContextMenu<T extends CollectionMenuItem = CollectionEntryModel>(
  resolve: CollectionItemMenuResolver<T> | undefined
): {
  entryProps(entry: T): CollectionContextMenuEntryProps | undefined;
  overlay: ReactNode;
} {
  const [open, setOpen] = useState<{ entry: T; point: ContextMenuPoint; seq: number } | null>(null);
  const close = useCallback(() => setOpen(null), []);
  const seqRef = useRef(0);

  const openFor = (entry: T, point: ContextMenuPoint) => {
    if (!resolve?.(entry)) {
      return false;
    }
    seqRef.current += 1;
    setOpen({ entry, point, seq: seqRef.current });
    return true;
  };

  const menu = open && resolve ? resolve(open.entry) : null;

  return {
    entryProps: (entry) => {
      if (!resolve) {
        return undefined;
      }
      return {
        onContextMenu: (event) => {
          // Always Clutter's menu or none — never the WebView's native one.
          event.preventDefault();
          event.stopPropagation();
          openFor(entry, pointFor(event));
        },
        'data-context-entry': entry.id,
        'data-context-menu-open': open?.entry.id === entry.id ? 'true' : undefined,
      };
    },
    // Keyed by target and press, so a right-click on another item (or the same one again) starts a fresh menu.
    overlay:
      open && menu ? <ResourceContextMenu
          key={`${open.entry.id}:${open.seq}`}
          menu={menu}
          point={open.point}
          onDone={close}
        /> : null,
  };
}
