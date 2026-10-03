import { Button } from '@components/button/Button';
import { Dialog } from '@components/dialog/Dialog';
import './SaveToVaultDialog.css';

export type SaveToVaultStatus =
  | { readonly state: 'saving' }
  | { readonly state: 'done'; readonly message: string }
  | { readonly state: 'error'; readonly message: string };

interface SaveToVaultDialogProps {
  readonly status: SaveToVaultStatus | null;
  readonly onClose: () => void;
}

/**
 * The feedback for "Save to vault": a "saving" state that can't be dismissed
 * (so the action can't be repeated while it runs), then what happened — how
 * many references were updated, which couldn't be — or why nothing changed.
 */
export function SaveToVaultDialog({ status, onClose }: SaveToVaultDialogProps) {
  const saving = status?.state === 'saving';

  return (
    <Dialog open={status !== null} onClose={onClose} size="medium" dismissible={!saving}>
      {status && (
        <div className="save-to-vault-dialog" role="status">
          <div className="save-to-vault-dialog__title">
            {status.state === 'saving'
              ? 'Saving to vault…'
              : status.state === 'done'
                ? 'Saved to vault'
                : 'Could not save to vault'}
          </div>
          <div className="save-to-vault-dialog__body">
            {status.state === 'saving'
              ? 'Downloading the image and updating the notes that use it.'
              : status.message}
          </div>
          {!saving && (
            <div className="save-to-vault-dialog__actions">
              <Button variant="outlined" onClick={onClose}>
                OK
              </Button>
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}
