import { useEffect, useRef } from 'react';

import { Button } from '../button/Button';

import './Confirmation.css';

export interface ConfirmationProps {
  title: string;
  description?: string;

  confirmLabel: string;
  cancelLabel?: string;

  onConfirm: () => void;
  onCancel: () => void;
}

export function Confirmation({
  title,
  description,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: ConfirmationProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Runs after Overlay's open effect so Cancel receives focus once the
  // confirmation popover has mounted — without special-casing Confirmation
  // inside useOverlayFocus.
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  return (
    <div className="confirmation">
      <div className="confirmation__content">
        <div className="confirmation__header">{title}</div>

        {description && <div className="confirmation__body">{description}</div>}
      </div>
      <div className="confirmation__actions">
        <Button ref={cancelRef} variant={'outlined'} size={'large'} onClick={onCancel}>
          {cancelLabel}
        </Button>

        <Button
          className="button-danger"
          variant={'filled'}
          size={'large'}
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
}
