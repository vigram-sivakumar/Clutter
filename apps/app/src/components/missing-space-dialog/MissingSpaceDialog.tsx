import { useEffect, useRef } from 'react';

import { Button } from '@components/button/Button';
import { Dialog } from '@components/dialog/Dialog';
import { SettingsEntry } from '@features/settings/settings-entry/SettingsEntry';
import { AppIcon } from '@shared/icon';
import '@components/confirmation/Confirmation.css';
import '@components/space-details/SpaceDetails.css';
import './MissingSpaceDialog.css';

interface MissingSpaceDialogProps {
  open: boolean;
  /** The saved location the space is no longer at. */
  path: string;
  /** The space's name — the name of the folder it was saved as. */
  name: string;
  /** Pick a folder for the space (the native picker; nothing is edited inline). */
  onChangeLocation: () => void;
  /** Forget the space in Clutter. The folder and its files are never touched. */
  onRemove: () => void;
  onClose: () => void;
}

/**
 * Shown when a space whose folder can't be found is chosen: what the space is (avatar and name, from its
 * saved path) and where Clutter last had it, kept visually apart, and what can be done about it. Composed on
 * the shared Dialog with the Confirmation's own layout classes, so it reads as one of the app's confirmations.
 */
export function MissingSpaceDialog({
  open,
  path,
  name,
  onChangeLocation,
  onRemove,
  onClose,
}: MissingSpaceDialogProps) {
  const changeRef = useRef<HTMLButtonElement>(null);

  // The safe action takes the focus, as Cancel does in the app's other confirmations: Enter never removes.
  useEffect(() => {
    if (open) changeRef.current?.focus();
  }, [open]);

  return (
    <Dialog open={open} onClose={onClose} size="large">
      <div className="confirmation">
        <Button
          className="confirmation__dismiss"
          variant="ghost"
          size="small"
          isIconOnly
          aria-label="Close"
          onClick={onClose}
        >
          <AppIcon icon="dismiss" />
        </Button>
        <div className="confirmation__content">
          <div className="confirmation__header">Space not found</div>
          <div className="confirmation__body">
            Clutter can’t find this space at its saved location. It may have
            been moved, renamed, or deleted
          </div>
        </div>

        {/* Its own avatar is kept inside the folder that can't be reached, so this is the initial. A long
            path is cut with an ellipsis (the full path is the tooltip) so the dialog never grows. */}
        <SettingsEntry
          className="missing-space__entry"
          title={name}
          description={path}
          titleClassName="truncate"
          descriptionClassName="truncate"
          trailing={
            <div className="space-details__avatar-picker">
              {Array.from(name.trim())[0]?.toUpperCase()}
            </div>
          }
        />

        <div className="confirmation__actions">
          <Button
            ref={changeRef}
            variant="outline"
            size="large"
            onClick={onChangeLocation}
          >
            Change location
          </Button>
          <Button variant="danger" size="large" onClick={onRemove}>
            Remove space
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
