import { useEffect, useRef } from 'react';

import { Button } from '@components/button/Button';
import { RoundIconButton } from '@components/button/RoundIconButton';
import { Dialog } from '@components/dialog/Dialog';
import { SettingsEntry } from '@features/settings/settings-entry/SettingsEntry';
import '@components/confirmation/Confirmation.css';
import '@components/space-details/SpaceDetails.css';
import './MissingSpaceDialog.css';

/** The recovery action's label, shared with Settings' Space page so both name the same action identically. */
export const CHANGE_LOCATION_LABEL = 'Change location';

interface MissingSpaceDialogProps {
  open: boolean;
  /** The saved location the space is no longer at. */
  path: string;
  /** The space's name — the name of the folder it was saved as. */
  name: string;
  /** Pick a folder for the space (the native picker; nothing is edited inline). */
  onChangeLocation: () => void;
  /** Why the folder the user just chose was refused, shown inline: the dialog stays so they can choose another. */
  error?: string | null;
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
  error = null,
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
      <div className="confirmation missing-space">
        <div className="missing-space__title">
          <div className="confirmation__header">Space not found</div>
          <RoundIconButton icon="dismiss" aria-label="Close" onClick={onClose} />
        </div>

        <div className="missing-space__content">
          {/* Its own avatar is kept inside the folder that can't be reached, so this is the initial. A long
              path is cut with an ellipsis so the dialog never grows. */}
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
          <div className="confirmation__body">
            Clutter can’t find this space at its saved location. It may have
            been moved, renamed, or deleted
          </div>
          {error !== null && (
            <span className="missing-space__error" role="alert">
              {error}
            </span>
          )}
        </div>

        <div className="confirmation__actions missing-space__footer">
          <Button variant="outline-danger" size="large" onClick={onRemove}>
            Remove space
          </Button>
          <Button
            ref={changeRef}
            variant="primary"
            size="large"
            onClick={onChangeLocation}
          >
            {CHANGE_LOCATION_LABEL}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
