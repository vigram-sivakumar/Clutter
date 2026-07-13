import type { ReactNode, RefObject } from 'react';

interface OverlayPlacement {
  side: 'top' | 'bottom' | 'left' | 'right';
  alignment: 'start' | 'end';
}

interface OverlayBackdrop {
  backdrop: false | 'transparent' | 'tinted';
}

export interface OverlayProps extends OverlayPlacement, OverlayBackdrop {
  // Visibility
  open: boolean;
  onClose: () => void;

  // Positioning
  anchorRef: RefObject<HTMLElement>;
  offset?: number;

  // Behaviour
  animate?: boolean;

  // Content
  children: ReactNode;
}
