import '../styles/tree-caret.css';

interface CaretSlotProps {
  children?: React.ReactNode;
  side?: 'start' | 'end';
}

export function CaretSlot({ children, side = 'start' }: CaretSlotProps) {
  return (
    <span className="caret-slot">
      {children && (
        <button
          type="button"
          className={`caret-wrapper caret-wrapper--${side}`}
        >
          {children}
        </button>
      )}
    </span>
  );
}
