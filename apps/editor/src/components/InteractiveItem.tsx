import '../styles/interactive-item.css';

type InteractiveItemProps = {
  caretVisibility?: 'hidden' | 'visible' | 'none';

  caretSlot?: React.ReactNode;
  hasStartSlot?: boolean;
  startSlot?: React.ReactNode;

  children?: React.ReactNode;

  hasEndSlot?: boolean;
  endSlot?: React.ReactNode;

  interactive?: boolean;
  className?: string;
};

export function InteractiveItem({
  caretVisibility = 'none',
  caretSlot,
  hasStartSlot = false,
  startSlot,
  children,
  hasEndSlot = false,
  endSlot,
  interactive = true,
  className,
}: InteractiveItemProps) {
  return (
    <div
      className={[
        'interactive-item',
        interactive ? 'interactive-item--interactive' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {hasStartSlot && (
        <div className="interactive-item__start-slot">
          {caretVisibility !== 'none' && (
            <div className="interactive-item__caret-slot">
              {caretVisibility === 'visible' && (
                <button
                  className="interactive-item__caret-trigger"
                  type="button"
                >
                  {caretSlot}
                </button>
              )}
            </div>
          )}
          {startSlot}
        </div>
      )}
      <div className="interactive-item__content-slot">{children}</div>
      {hasEndSlot && (
        <div className="interactive-item__end-slot">{endSlot}</div>
      )}
    </div>
  );
}
