import type { ReactNode, RefObject } from 'react';

export type OverlaySide = 'top' | 'bottom' | 'left' | 'right';

export type OverlayAlignment = 'start' | 'end';

export type OverlayBackdrop = false | 'transparent' | 'tinted';

export interface OverlayProps {
  // Visibility
  open: boolean;
  onClose: () => void;

  // Positioning
  anchorRef: RefObject<HTMLElement>;
  side?: OverlaySide;
  alignment?: OverlayAlignment;
  offset?: number;

  // Behaviour
  backdrop?: OverlayBackdrop;
  animate?: boolean;

  // Content
  children: ReactNode;
}
