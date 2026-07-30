import './Reference.css';
import { Caret } from '@components/caret/Caret';
import { Button } from '@components/button/Button';

import { AppIcon } from '@shared/icon';

interface ReferencesProps {
  isEmpty?: boolean;
  isExpanded?: boolean;
  onExpandToggle?: () => void;
}

export function References({
  isEmpty,
  isExpanded,
  onExpandToggle,
  ...buttonProps
}: ReferencesProps) {
  return (
    <div className="references">
      <Button
        className="reference-button"
        interaction="subtle"
        {...buttonProps}
        onClick={onExpandToggle}
        leading={
          <Caret disabled={isEmpty} isExpanded={isExpanded} variant="tree" />
        }
      >
        References
      </Button>
      <div className="references__icons">
        <AppIcon icon="note" />
        <AppIcon icon="calendar" />
        <AppIcon icon="squareCheckOutline" />
      </div>
    </div>
  );
}
