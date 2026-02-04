import { ReactNode, MouseEvent } from 'react';
import { Button } from './Button';

interface SecondaryButtonProps {
  children?: ReactNode;
  icon?: ReactNode;
  iconSize?: number;
  iconPosition?: 'left' | 'right';
  shortcut?: string;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  onMouseDown?: (e: MouseEvent<HTMLButtonElement>) => void;
  danger?: boolean;
  size?: 'xs' | 'small' | 'medium' | 'large';
  fullWidth?: boolean;
  withBackground?: boolean;
  onBackground?: 'default' | 'secondary' | 'tertiary';
  noBorder?: boolean;
  disabled?: boolean;
}

export const SecondaryButton = ({
  children,
  icon,
  iconSize,
  iconPosition,
  shortcut,
  onClick,
  onMouseDown,
  danger,
  size = 'medium',
  fullWidth = false,
  withBackground = false,
  onBackground = 'secondary',
  noBorder = false,
  disabled = false,
}: SecondaryButtonProps) => {
  return (
    <Button
      variant="secondary"
      size={size}
      icon={icon}
      iconSize={iconSize}
      iconPosition={iconPosition}
      shortcut={shortcut}
      onClick={onClick}
      onMouseDown={onMouseDown}
      danger={danger}
      fullWidth={fullWidth}
      withBackground={withBackground}
      onBackground={onBackground}
      noBorder={noBorder}
      disabled={disabled}
    >
      {children}
    </Button>
  );
};
