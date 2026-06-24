import '../styles/list-item.css';

export interface ListItemProps {
  startSlot?: React.ReactNode;
  label: React.ReactNode;
  endSlot?: React.ReactNode;

  labelStyle?: 'body' | 'label';

  state?: 'default' | 'selected' | 'disabled';

  onClick?: () => void;
}

export function ListItem({
  startSlot,
  label,
  endSlot,
  labelStyle = 'body',
  state = 'default',
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
      className={[
        'list-item',
        `list-item--${labelStyle}`,
        `list-item--${state}`,
      ].join(' ')}
      onClick={handleClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick && state !== 'disabled' ? 0 : undefined}
    >
      {startSlot && <div className="list-item__start">{startSlot}</div>}

      <div className="list-item__label">{label}</div>

      {endSlot && <div className="list-item__end">{endSlot}</div>}
    </div>
  );
}
