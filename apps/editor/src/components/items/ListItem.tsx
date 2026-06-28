import '../../styles/list-item.css';

export interface ListItemProps {
  selected?: boolean;
  disabled?: boolean;

  startSlot?: React.ReactNode;
  children: React.ReactNode;
  endSlot?: React.ReactNode;
  actions?: React.ReactNode;
  titleSlot?: React.ReactNode;

  className?: string;
  onClick?: () => void;
}

export function ListItem({
  selected = false,
  disabled = false,

  startSlot,
  children,
  endSlot,
  actions,
  titleSlot,
  className,
  onClick,
}: ListItemProps) {
  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (disabled) {
      return;
    }

    const target = event.target as HTMLElement;

    const interactiveElement = target.closest(
      'button, a, input, select, textarea, [role="button"]'
    );

    if (interactiveElement) {
      return;
    }

    onClick?.();
  };

  return (
    <div
      className={[
        'list-item',
        selected && 'list-item-selected',
        disabled && 'list-item-disabled',
        className,
      ].join(' ')}
      onClick={handleClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick && !disabled ? 0 : undefined}
    >
      {startSlot && <div className="list-item__start">{startSlot}</div>}

      <div className="list-item__label">
        <span className="list-item__title">{children}</span>
        {titleSlot}
      </div>

      {(endSlot || actions) && (
        <div className="list-item__end">
          {endSlot}
          {actions && <div className="list-item__actions">{actions}</div>}
        </div>
      )}
    </div>
  );
}
