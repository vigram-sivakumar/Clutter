import './Caret.css';
import { AppIcon } from '@shared/icon';
interface CaretProps {
  variant?: 'tree' | 'dropdown';
  isPlaceholder?: boolean;
  isExpanded?: boolean;
  disabled?: boolean;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
}

export function Caret({
  variant = 'tree',
  isPlaceholder = false,
  isExpanded = false,
  disabled = false,
  onClick,
}: CaretProps) {
  if (isPlaceholder) {
    return <span className="caret-slot" aria-hidden />;
  }

  return (
    <button
      type="button"
      className="caret-slot"
      disabled={disabled}
      onClick={onClick}
    >
      <span
        className={`caret-icon caret-icon--${variant} ${isExpanded ? 'caret-icon--expanded' : 'caret-icon--collapsed'}`}
      >
        <AppIcon icon="caretRight" size={12} slotSize={12} />
      </span>
    </button>
  );
}
