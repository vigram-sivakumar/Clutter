import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { OverflowMenuBody } from '@components/menu/OverflowMenu';
import { Overlay } from '@components/overlay/Overlay';

import type { ResourceTopBarActionsProps } from '../topbar/ResourceTopBarActions';
import { ResourceMenuDialogs, useResourceMenuDispatch } from '../topbar/useResourceMenuDispatch';

export interface ContextMenuPoint {
  readonly x: number;
  readonly y: number;
}

export interface ResourceContextMenuProps {
  /** The resource's More actions menu — exactly what the topbar renders for it (`buildResourceContextMenu`). */
  menu: ResourceTopBarActionsProps;
  /** Where the menu opens: the pointer's viewport position. */
  point: ContextMenuPoint;
  /** The menu, and anything its selection opened (Move picker, Confirmation), is finished with. */
  onDone(): void;
}

/**
 * A resource's More actions menu opened at a point — a right-click — instead of beside a button. The
 * items, handlers, confirmations and Move picker are the topbar's (`useResourceMenuDispatch`); this
 * adds only the anchor. Positioning is the shared Overlay's, so the menu flips and clamps inside the
 * window near an edge, and it is portaled to `document.body`, so no scroll container clips it.
 *
 * Stays mounted until the menu AND whatever it opened have closed: choosing Move or a confirmed
 * action closes the menu while the picker/dialog (anchored to the same point) is still showing.
 */
export function ResourceContextMenu({ menu, point, onDone }: ResourceContextMenuProps) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const suppressReturnFocusRef = useRef(false);
  const [menuOpen, setMenuOpen] = useState(true);
  const dispatch = useResourceMenuDispatch(menu);

  const idle = !menuOpen && !dispatch.moveTrigger.open && dispatch.confirmation.pending === null;
  useEffect(() => {
    if (idle) {
      onDone();
    }
  }, [idle, onDone]);

  return (
    <>
      {createPortal(
        <span
          ref={anchorRef}
          aria-hidden="true"
          style={{ position: 'fixed', left: point.x, top: point.y, width: 0, height: 0, pointerEvents: 'none' }}
        />,
        document.body
      )}
      <Overlay
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        anchorRef={anchorRef}
        side="bottom"
        alignment="start"
        offset={0}
        suppressReturnFocusRef={suppressReturnFocusRef}
      >
        <OverflowMenuBody
          items={menu.menu}
          onSelect={dispatch.select}
          onOpenChange={(open) => setMenuOpen(open)}
          suppressReturnFocusRef={suppressReturnFocusRef}
        />
      </Overlay>
      <ResourceMenuDialogs
        dispatch={dispatch}
        anchorRef={anchorRef}
        moveDestinations={menu.moveDestinations}
        onMove={menu.onMove}
        onCreateFolder={menu.onCreateFolder}
        side="bottom"
        alignment="start"
      />
    </>
  );
}
