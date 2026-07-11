import { ReactNode, RefObject } from 'react';

export type OverlayPlacement =
  | 'top-start'
  | 'top-end'
  | 'bottom-start'
  | 'bottom-end'
  | 'left-start'
  | 'left-end'
  | 'right-start'
  | 'right-end';

export interface OverlayProps {
  open: boolean;
  anchorRef: RefObject<HTMLElement>;
  placement?: OverlayPlacement;
  offset?: number;
  backdrop?: boolean;
  dismissOnOutsideClick?: boolean;
  onClose: () => void;
  children: ReactNode;
  animate?: boolean;
}
