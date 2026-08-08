import type { ReactNode, RefObject } from 'react';

export type OverlaySide = 'top' | 'bottom' | 'left' | 'right';

export type OverlayPlacement = OverlaySide | 'center';

export type OverlayAlignment = 'start' | 'end';

export type OverlayBackdrop = false | 'transparent' | 'tinted';

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
  animate?: boolean;

  children: ReactNode;
  className?: string;

  /** Restores focus here when the overlay closes. Anchored overlays fall back to anchorRef. */
  returnFocusRef?: RefObject<HTMLElement>;
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
}

export type OverlayProps = AnchoredOverlayProps | CenteredOverlayProps;
