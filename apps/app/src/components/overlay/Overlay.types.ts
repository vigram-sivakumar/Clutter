import type { MutableRefObject, ReactNode, RefObject } from 'react';

export type OverlaySide = 'top' | 'bottom' | 'left' | 'right';

export type OverlayPlacement = OverlaySide | 'center';

/**
 * Where the overlay lines up along the anchor's edge: `start` / `end` flush
 * with the anchor's start / end edge, `center` centered on the anchor (a
 * `left` / `right` overlay vertically centered, a `top` / `bottom` one
 * horizontally centered).
 */
export type OverlayAlignment = 'start' | 'end' | 'center';

export type OverlayBackdrop = false | 'transparent' | 'tinted';

export type OverlayScrim = 'default' | 'strong';

export interface OverlayLayout {
  top: number;
  left: number;
  transformOrigin: string;
  placement: OverlayPlacement;
}

interface OverlayBaseProps {
  open: boolean;
  onClose: () => void;

  backdrop?: OverlayBackdrop;
  scrim?: OverlayScrim;
  animate?: boolean;

  /**
   * When `false`, Escape and a backdrop click no longer call `onClose` —
   * the backdrop (if any) still renders, but only an explicit call to
   * `onClose` from inside this overlay's own content (e.g. a dedicated
   * close button) can dismiss it. Defaults to `true`, preserving every
   * existing caller's current auto-dismiss behavior.
   */
  dismissible?: boolean;

  /**
   * Lets the native window be dragged from a strip along the top of the backdrop (the app's shared
   * `TauriDragStrip`). A backdrop covers the whole app, and with it the app's own drag regions (topbar,
   * sidebar), so every overlay with a backdrop keeps the window draggable. The strip sits in the backdrop,
   * below the overlay's surface, so it never covers the surface's content. Needs a backdrop. On by default;
   * pass `false` to opt out.
   */
  dragRegion?: boolean;

  /**
   * A right-click anywhere while this overlay is open dismisses it, and neither the platform's own context
   * menu nor any other `contextmenu` handler sees that event — the way a native menu closes on a second
   * right-click. On by default for every overlay (menus, pickers, popovers), and only while it is
   * `dismissible`; a right-click on a text field inside the overlay keeps its native text menu. Pass `false`
   * to opt an overlay out.
   */
  dismissOnContextMenu?: boolean;

  children: ReactNode;
  className?: string;

  /** Restores focus here when the overlay closes. Anchored overlays fall back to anchorRef. */
  returnFocusRef?: RefObject<HTMLElement>;

  /**
   * Set `.current = true` immediately before the state change that closes
   * this overlay, to skip that one focus restoration — see
   * `useOverlayFocus`'s own doc comment for the full contract. Forwarded
   * straight through; this component owns none of the suppression
   * decision itself.
   */
  suppressReturnFocusRef?: MutableRefObject<boolean>;
}

export interface AnchoredOverlayProps extends OverlayBaseProps {
  position?: 'anchored';
  anchorRef: RefObject<HTMLElement>;
  side?: OverlaySide;
  alignment?: OverlayAlignment;
  offset?: number;
}

export interface CenteredOverlayProps extends OverlayBaseProps {
  position: 'centered';
  /**
   * Fixed distance in px from the viewport's top edge, in place of this
   * overlay's default true vertical center. Horizontal centering is
   * unaffected. Still clamped the same way the default centered position
   * is — see `useOverlayCenteredPosition` — so a window too short for both
   * this value and the overlay's own height never crops it; it's pulled
   * back down to fit instead.
   */
  top?: number;
}

export type OverlayProps = AnchoredOverlayProps | CenteredOverlayProps;
