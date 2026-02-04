import { ReactNode, MouseEvent } from 'react';
import { Button } from './Button';

interface FilledButtonProps {
  children?: ReactNode;
  icon?: ReactNode;
  iconSize?: number;
  iconPosition?: 'left' | 'right';
  shortcut?: string;
  onClick?: (_e: MouseEvent<HTMLButtonElement>) => void;
  onMouseDown?: (_e: MouseEvent<HTMLButtonElement>) => void;
  danger?: boolean;
  size?: 'xs' | 'small' | 'medium' | 'large';
  onBackground?: 'default' | 'secondary' | 'tertiary';
  fullWidth?: boolean;
  disabled?: boolean;
}

export const FilledButton = ({
  children,
  icon,
  iconSize,
  iconPosition,
  shortcut,
  onClick,
  onMouseDown,
  danger = false,
  size = 'medium',
  onBackground = 'secondary',
  fullWidth = false,
  disabled = false,
}: FilledButtonProps) => {
  return (
    <Button
      variant="filled"
      size={size}
      icon={icon}
      iconSize={iconSize}
      iconPosition={iconPosition}
      shortcut={shortcut}
      onClick={onClick}
      onMouseDown={onMouseDown}
      danger={danger}
      onBackground={onBackground}
      fullWidth={fullWidth}
      disabled={disabled}
    >
      {children}
    </Button>
  );
};
