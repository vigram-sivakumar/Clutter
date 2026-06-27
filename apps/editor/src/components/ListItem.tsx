import '../styles/list-item.css';

export interface ListItemProps {
  startSlot?: React.ReactNode;
  children: React.ReactNode;
  endSlot?: React.ReactNode;
  actions?: React.ReactNode;
  titleSlot?: React.ReactNode;
  className?: string;

  state?: 'default' | 'selected' | 'disabled';
  onClick?: () => void;
}

export function ListItem({
  startSlot,
  children,
  endSlot,
  actions,
  titleSlot,
  state = 'default',
  className,
  onClick,
}: ListItemProps) {
  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (state === 'disabled') {
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
      className={['list-item', `list-item--${state}`, className].join(' ')}
      onClick={handleClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick && state !== 'disabled' ? 0 : undefined}
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
