import type { ReactNode } from 'react';
import { Overlay } from '../overlay/Overlay';
import type { OverlayProps } from '@components/overlay/Overlay.types';
import './Popover.css';

export interface PopoverProps extends Pick<
  OverlayProps,
  'anchorRef' | 'open' | 'onClose' | 'side' | 'alignment' | 'offset'
> {
  size?: 'small' | 'medium' | 'large';

  className?: string;
  children: ReactNode;
}

export function Popover({
  className,
  size = 'medium',
  children,
  ...overlayProps
}: PopoverProps) {
  const popoverClassName = ['popover', `popover--${size}`, className]
    .filter(Boolean)
    .join(' ');
  return (
    <Overlay {...overlayProps} className={popoverClassName}>
      {children}
    </Overlay>
  );
}
