import { forwardRef } from 'react';
import { AppIcon, type SystemIcon } from '@shared/icon';
import { Button, type ButtonProps } from './Button';
import './RoundIconButton.css';

type RoundIconButtonProps = Omit<
  ButtonProps,
  'children' | 'isIconOnly' | 'leading' | 'trailing' | 'interaction' | 'size' | 'aria-label'
> & {
  icon: SystemIcon;
  /** `xs` (20px) by default. */
  size?: ButtonProps['size'];
  /** An icon alone has no text, so its name is required. */
  'aria-label': string;
};

/**
 * The circular icon-only button, drawn by `Button` with a round, filled look. Always icon-only (it takes an
 * `icon`, never children), always named, and `xs` (20px) unless a caller asks for another size. `interaction` is not offered: the subtle interaction hides the
 * fill on hover, which is the opposite of what this button is for.
 */
/** The icon drawn in the xs button: smaller than the 16px every other button uses, so it sits well inside 20px. */
const XS_ICON_SIZE = 12;

export const RoundIconButton = forwardRef<HTMLButtonElement, RoundIconButtonProps>(
  function RoundIconButton({ icon, className, size = 'xs', ...props }, ref) {
    return (
      <Button
        ref={ref}
        variant="ghost"
        size={size}
        isIconOnly
        className={['round-icon-button', className]
          .filter(Boolean)
          .join(' ')}
        {...props}
      >
        <AppIcon icon={icon} size={size === 'xs' ? XS_ICON_SIZE : undefined} />
      </Button>
    );
  }
);
