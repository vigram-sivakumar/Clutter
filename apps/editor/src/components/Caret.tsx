import '../styles/Caret.css';
import { Icons } from '../design-system/icons';

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
        className={`caret-wrapper caret-icon--${variant}`}
        type="button"
        onClick={onClick}
        disabled={disabled}
      >
        <span
          className={`caret-icon ${isExpanded ? 'caret-icon--expanded' : 'caret-icon--collapsed'}`}
        >
          <Icons.CaretRight width={12} height={12} />
        </span>
      </button>
    </span>
  );
}
