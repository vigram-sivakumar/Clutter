import { ReactNode, MouseEvent } from 'react';
import { Button } from './Button';

interface PrimaryButtonProps {
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
  disabled?: boolean;
}

export const PrimaryButton = ({
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
  disabled = false,
}: PrimaryButtonProps) => {
  return (
    <Button
      variant="primary"
      size={size}
      icon={icon}
      iconSize={iconSize}
      iconPosition={iconPosition}
      shortcut={shortcut}
      onClick={onClick}
      onMouseDown={onMouseDown}
      danger={danger}
      fullWidth={fullWidth}
      disabled={disabled}
    >
      {children}
    </Button>
  );
};
