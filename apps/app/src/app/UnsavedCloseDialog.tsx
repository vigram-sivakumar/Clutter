import { Confirmation } from '../components/confirmation/Confirmation';
import { Dialog } from '../components/dialog/Dialog';
import { unsavedCloseCopy } from './unsavedCloseCopy';
import type { UnsavedCloseChoice } from './windowCloseHandler';

interface UnsavedCloseDialogProps {
  /** How many notes still have unsaved changes, or null when no close is waiting on the user. */
  readonly unsavedCount: number | null;
  readonly onAnswer: (choice: UnsavedCloseChoice) => void;
}

/**
 * The question asked when Clutter is closed (the window's close button or ⌘Q) while notes still have unsaved
 * changes after the flush. Dismissing it any way other than the destructive button is "cancel": the user goes back
 * to their notes and nothing has been discarded.
 */
export function UnsavedCloseDialog({ unsavedCount, onAnswer }: UnsavedCloseDialogProps) {
  const copy = unsavedCount === null ? null : unsavedCloseCopy(unsavedCount);

  return (
    <Dialog open={copy !== null} onClose={() => onAnswer('cancel')} size="medium">
      {copy && (
        <Confirmation
          title={copy.title}
          description={copy.description}
          confirmLabel={copy.confirmLabel}
          cancelLabel={copy.cancelLabel}
          onConfirm={() => onAnswer('close')}
          onCancel={() => onAnswer('cancel')}
        />
      )}
    </Dialog>
  );
}
