import '../styles/caret.css';
import { CustomIcons, ICON_SMALL } from '../design-system/icons';

interface CaretProps {
  type?: 'tree' | 'dropdown';
  state?: 'placeholder' | 'collapsed' | 'expanded' | 'disabled';
  onClick?: () => void;
}

export function Caret({
  type = 'tree',
  state = 'collapsed',
  onClick,
}: CaretProps) {
  const disabled = state === 'disabled';

  return (
    <span className="tree-caret">
      {state !== 'placeholder' && (
        <button
          type="button"
          className={`caret-wrapper caret-wrapper--${type}${disabled ? ' caret-wrapper--disabled' : ''}`}
          onClick={onClick}
          disabled={disabled}
        >
          <span
            className={`tree-caret__icon tree-caret__icon--${type} tree-caret__icon--${state}`}
          >
            <CustomIcons.CaretRight size={ICON_SMALL} />
          </span>
        </button>
      )}
    </span>
  );
}
