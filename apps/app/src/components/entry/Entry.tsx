import '../../styles/Entry.css';

export interface EntryProps {
  children: React.ReactNode;

  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  actions?: React.ReactNode;

  selected?: boolean;
  disabled?: boolean;

  onClick?: () => void;
}

export function Entry({
  leading,
  children,
  trailing,
  actions,

  selected = false,
  disabled = false,
  onClick,
}: EntryProps) {
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
        'entry',
        selected && 'entry-selected',
        disabled && 'entry-disabled',
      ].join(' ')}
      onClick={handleClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick && !disabled ? 0 : undefined}
    >
      {leading && <div className="entry__leading">{leading}</div>}

      <div className="entry__content">
        {children}
        {/* <span className="entry__title">{children}</span> */}
      </div>

      {(trailing || actions) && (
        <div className="entry__trailing">
          {trailing && <div className="entry__meta">{trailing}</div>}
          {actions && <div className="entry__actions">{actions}</div>}
        </div>
      )}
    </div>
  );
}
