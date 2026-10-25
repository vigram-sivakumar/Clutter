import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import type { CollectionSelection } from '@features/collection/selection/useCollectionSelection';

import type { ResourceTopBarActionsProps } from '../topbar/ResourceTopBarActions';
import { buildSelectionContextMenu } from './buildSelectionContextMenu';
import { ResourceContextMenu, type ContextMenuPoint } from './ResourceContextMenu';

export interface CollectionSelectionMenu {
  /**
   * A right-click on the item `id`, at `point`. In selection mode it opens the selection's menu and returns `true`
   * (right-clicking an item that is not checked first makes it the only checked one; a checked one keeps the whole
   * selection). With nothing checked it does nothing and returns `false`, so the item's own menu opens as it always has.
   */
  handle(id: string, point: ContextMenuPoint): boolean;
  /** Render once, with the body. */
  overlay: ReactNode;
}

/**
 * The right-click menu of a Collection View's selection. `resolveFor` is the body's own single-item menu for an id
 * (a note, folder or asset — whatever the body shows); the selection's menu is composed from those
 * (`buildSelectionContextMenu`) and shown by the same `ResourceContextMenu`. The menu is built once, when it opens,
 * from the items that were selected THEN, so what its actions run on never changes while it — or a
 * confirmation or the Move picker it opened — is still on screen, however the selection moves meanwhile.
 */
export function useCollectionSelectionMenu(
  selection: CollectionSelection,
  resolveFor: (id: string) => ResourceTopBarActionsProps | null
): CollectionSelectionMenu {
  const [open, setOpen] = useState<{
    menu: ResourceTopBarActionsProps;
    point: ContextMenuPoint;
    seq: number;
    immediate?: string;
  } | null>(null);
  const seqRef = useRef(0);
  const close = useCallback(() => setOpen(null), []);

  // Delete / Backspace while items are selected moves them to the trash — the menu's own Move to trash, run for the
  // selection as it is now (so a folder with contents asks the same confirmation). Only in selection mode, and never
  // while something else has the keys: a field, an editor, a menu or a dialog that is open.
  const latest = useRef({ selection, resolveFor });
  latest.current = { selection, resolveFor };
  useEffect(() => {
    if (!selection.active) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return;
      }
      if (event.key !== 'Delete' && event.key !== 'Backspace') {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"]), .cm-editor')) {
        return;
      }
      if (document.querySelector('[role="menu"], [role="dialog"], .overlay__backdrop')) {
        return;
      }
      const { selection: current, resolveFor: resolve } = latest.current;
      const composed = buildSelectionContextMenu(current.selectedIds.map(resolve), {
        total: current.total,
        selectAll: current.selectAll,
        clear: current.clear,
      });
      // The key has no menu to choose from, so it always asks first (the menu's Move to trash asks only where the
      // existing rule does: a folder with contents).
      const count = current.selectedIds.length;
      const menu = {
        ...composed,
        archiveConfirmationTitle: composed.archiveConfirmationTitle ?? (count > 1 ? `Move ${count} items to trash?` : 'Move this item to trash?'),
        archiveConfirmationMessage: composed.archiveConfirmationMessage ?? 'You can restore them from the trash',
      };
      // Only when the selection can be moved to the trash at all.
      if (!menu.menu.some((item) => item.id === 'archive')) {
        return;
      }
      event.preventDefault();
      seqRef.current += 1;
      setOpen({ menu, point: { x: 0, y: 0 }, seq: seqRef.current, immediate: 'archive' });
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [selection.active]);

  return {
    handle: (id, point) => {
      if (!selection.active) {
        return false;
      }
      const ids = selection.isChecked(id) ? selection.selectedIds : [id];
      if (!selection.isChecked(id)) {
        selection.selectOnly(id);
      }
      seqRef.current += 1;
      setOpen({
        menu: buildSelectionContextMenu(ids.map(resolveFor), { total: selection.total, selectAll: selection.selectAll, clear: selection.clear }),
        point,
        seq: seqRef.current,
      });
      return true;
    },
    overlay: open ? (
      <ResourceContextMenu key={open.seq} menu={open.menu} point={open.point} immediate={open.immediate} onDone={close} />
    ) : null,
  };
}
