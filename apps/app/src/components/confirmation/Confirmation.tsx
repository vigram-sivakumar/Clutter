import { useEffect, useRef } from 'react';

import { Button } from '../button/Button';
import { AppIcon } from '@shared/icon';

import './Confirmation.css';

export interface ConfirmationProps {
  title: string;
  description?: string;

  confirmLabel: string;
  cancelLabel?: string;
  /** The confirm button's treatment: 'danger' (default) or the standard 'primary' button. */
  confirmVariant?: 'danger' | 'primary';

  onConfirm: () => void;
  onCancel: () => void;

  /**
   * A second action in place of Cancel: when given, the footer is [alternate][confirm] with no
   * Cancel button, and a close (×) button in the corner dismisses the confirmation via
   * `onCancel` — the usual "two real choices, dismiss to do neither" shape.
   */
  alternateLabel?: string;
  alternateVariant?: 'danger' | 'primary';
  onAlternate?: () => void;
}

export function Confirmation({
  title,
  description,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  confirmVariant = 'danger',
  onConfirm,
  onCancel,
  alternateLabel,
  alternateVariant = 'danger',
  onAlternate,
}: ConfirmationProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const hasAlternate = onAlternate !== undefined && alternateLabel !== undefined;

  // Runs after Overlay's open effect so Cancel receives focus once the
  // confirmation popover has mounted — without special-casing Confirmation
  // inside useOverlayFocus. With an alternate action there is no Cancel, so the
  // (non-destructive-by-convention) confirm button takes the focus instead.
  useEffect(() => {
    (hasAlternate ? confirmRef : cancelRef).current?.focus();
  }, [hasAlternate]);

  return (
    <div className="confirmation">
      {hasAlternate && (
        <Button
          className="confirmation__dismiss"
          variant="ghost"
          size="small"
          isIconOnly
          aria-label="Close"
          onClick={onCancel}
        >
          <AppIcon icon="dismiss" />
        </Button>
      )}
      <div className="confirmation__content">
        <div className="confirmation__header">{title}</div>

        {description && <div className="confirmation__body">{description}</div>}
      </div>
      <div className="confirmation__actions">
        {hasAlternate ? (
          <Button
            variant={alternateVariant === 'danger' ? 'danger' : 'primary'}
            size={'large'}
            onClick={onAlternate}
          >
            {alternateLabel}
          </Button>
        ) : (
          <Button ref={cancelRef} variant={'outlined'} size={'large'} onClick={onCancel}>
            {cancelLabel}
          </Button>
        )}

        <Button
          ref={confirmRef}
          variant={confirmVariant === 'danger' ? 'danger' : 'primary'}
          size={'large'}
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
}
