import './Caret.css';
import { AppIcon } from '@shared/icon';
interface CaretProps {
  variant?: 'tree' | 'dropdown';
  isPlaceholder?: boolean;
  isExpanded?: boolean;
  disabled?: boolean;
  onClick?: () => void;
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
    <span className="caret-slot">
      <button
        className={`caret-wrapper caret-wrapper--${variant}`}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onClick?.();
        }}
        disabled={disabled}
      >
        <span
          className={`caret-icon ${isExpanded ? 'caret-icon--expanded' : 'caret-icon--collapsed'}`}
        >
          <AppIcon icon="caretRight" size={12} />
        </span>
      </button>
    </span>
  );
}
