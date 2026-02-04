import { ReactNode, MouseEvent } from 'react';
import { Button } from './Button';

interface TertiaryButtonProps {
  children?: ReactNode;
  icon?: ReactNode;
  iconSize?: number;
  iconPosition?: 'left' | 'right';
  shortcut?: string;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  onMouseDown?: (e: MouseEvent<HTMLButtonElement>) => void;
  subtle?: boolean;
  size?: 'xs' | 'small' | 'medium' | 'large';
  active?: boolean;
  fullWidth?: boolean;
  disabled?: boolean;
  disabledNoFade?: boolean;
  fontSize?: string;
  gap?: string;
  noHoverBackground?: boolean;
}

export const TertiaryButton = ({
  children,
  icon,
  iconSize,
  iconPosition,
  shortcut,
  onClick,
  onMouseDown,
  subtle = false,
  size = 'medium',
  active,
  fullWidth = false,
  disabled = false,
  disabledNoFade = false,
  fontSize,
  gap,
  noHoverBackground = false,
}: TertiaryButtonProps) => {
  return (
    <Button
      variant="tertiary"
      size={size}
      icon={icon}
      iconSize={iconSize}
      iconPosition={iconPosition}
      shortcut={shortcut}
      onClick={onClick}
      onMouseDown={onMouseDown}
      subtle={subtle}
      active={active}
      fullWidth={fullWidth}
      disabled={disabled}
      disabledNoFade={disabledNoFade}
      fontSize={fontSize}
      gap={gap}
      noHoverBackground={noHoverBackground}
    >
      {children}
    </Button>
  );
};
