import type { ReactNode } from 'react';
import { Overlay } from '../overlay/Overlay';
import type { CenteredOverlayProps } from '@components/overlay/Overlay.types';
import './Dialog.css';

export interface DialogProps extends Pick<
  CenteredOverlayProps,
  'open' | 'onClose' | 'returnFocusRef' | 'backdrop' | 'animate'
> {
  size?: 'small' | 'medium' | 'large';

  className?: string;
  children: ReactNode;
}

export function Dialog({
  className,
  size = 'medium',
  backdrop = 'tinted',
  animate = true,
  children,
  ...overlayProps
}: DialogProps) {
  const dialogClassName = ['dialog', `dialog--${size}`, className]
    .filter(Boolean)
    .join(' ');

  return (
    <Overlay
      {...overlayProps}
      position="centered"
      backdrop={backdrop}
      animate={animate}
      className={dialogClassName}
    >
      {children}
    </Overlay>
  );
}
