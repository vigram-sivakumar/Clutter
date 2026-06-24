import '../styles/tree-caret.css';
import { CustomIcons, ICON_SMALL } from '../design-system/icons';

interface CaretSlotProps {
  side?: 'start' | 'end';
  hasCaret?: boolean;
  isExpanded?: boolean;
  isDisabled?: boolean;
  onClick?: () => void;
}

export function CaretSlot({
  side = 'start',
  hasCaret = false,
  isExpanded = false,
  isDisabled = false,
  onClick,
}: CaretSlotProps) {
  return (
    <span className="tree-caret">
      {hasCaret ? (
        <button
          type="button"
          className={`caret-wrapper caret-wrapper--${side}${isDisabled ? ' caret-wrapper--disabled' : ''}`}
          onClick={onClick}
          disabled={isDisabled}
        >
          <span
            className={
              isExpanded
                ? 'tree-caret__icon tree-caret__icon--expanded'
                : 'tree-caret__icon'
            }
          >
            <CustomIcons.CaretRight size={ICON_SMALL} />
          </span>
        </button>
      ) : null}
    </span>
  );
}
