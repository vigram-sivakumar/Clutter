import { Confirmation } from '../components/confirmation/Confirmation';
import { Dialog } from '../components/dialog/Dialog';
import { unsavedCloseCopy, type UnsavedAction } from './unsavedCloseCopy';
import type { UnsavedCloseChoice } from './windowCloseHandler';

interface UnsavedCloseDialogProps {
  /** How many notes still have unsaved changes, or null when no close is waiting on the user. */
  readonly unsavedCount: number | null;
  /** What the user was doing, which words the question: closing Clutter, or switching to another space. */
  readonly action?: UnsavedAction;
  /** True when a recovery copy of the unsaved work is confirmed on disk (see `unsavedCloseCopy`). */
  readonly recoveryKept?: boolean;
  readonly onAnswer: (choice: UnsavedCloseChoice) => void;
}

/**
 * The question asked when Clutter is closed (the window's close button or ⌘Q) while notes still have unsaved
 * changes after the flush. Dismissing it any way other than the destructive button is "cancel": the user goes back
 * to their notes and nothing has been discarded.
 */
export function UnsavedCloseDialog({ unsavedCount, action = 'close', recoveryKept = false, onAnswer }: UnsavedCloseDialogProps) {
  const copy = unsavedCount === null ? null : unsavedCloseCopy(unsavedCount, action, recoveryKept);

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
