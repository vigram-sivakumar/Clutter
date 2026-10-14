import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

import { Button } from '@components/button/Button';
import { Input } from '../input/Input';
import { useRejectShake } from '../property-list/useRejectShake';
import { pickSpaceFolder } from './pickSpaceFolder';
import './SpaceDetails.css';

/**
 * A space the user is setting up. Nothing exists on disk yet: the folder
 * will be `<parentPath>/<name.trim()>`, created only when the (later)
 * confirm step runs.
 */
export interface NewSpaceDraft {
  /** Absolute path of the folder the space will be created in. */
  parentPath: string;
  /** That folder's display name, e.g. "Documents". */
  parentName: string;
  /** Space name — also the new folder's name. Starts empty. */
  name: string;
}

const MAX_FOLDER_NAME_BYTES = 255;

/** Whether `name` can be used as a folder name. */
export function isValidSpaceName(name: string): boolean {
  const trimmed = name.trim();
  if (trimmed === '' || trimmed === '.' || trimmed === '..') return false;
  // `/` and `:` are path separators on macOS, `\\` on Windows; control
  // characters are never valid in a file name.
  // eslint-disable-next-line no-control-regex
  if (/[/\\:\u0000-\u001f]/.test(trimmed)) return false;
  return new TextEncoder().encode(trimmed).length <= MAX_FOLDER_NAME_BYTES;
}

interface SpaceDetailsProps {
  draft: NewSpaceDraft;
  onNameChange: (name: string) => void;
  onParentChange: (parent: { parentPath: string; parentName: string }) => void;
}

export function SpaceDetails({
  draft,
  onNameChange,
  onParentChange,
}: SpaceDetailsProps) {
  const { shakeClassName, shake } = useRejectShake();
  const locationShake = useRejectShake();
  const [isChangingLocation, setIsChangingLocation] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isCreated, setIsCreated] = useState(false);

  // An unusable name shakes the whole Space Name card, never a message; the input
  // is left exactly as typed.
  function handleNameChange(name: string) {
    if (!isValidSpaceName(name)) shake();
    onNameChange(name);
  }

  // Change: the same native picker as "Select a folder", but it only picks the
  // parent folder for the new space — nothing is opened or written. A cancelled
  // picker changes nothing; an unusable folder shakes the Location card.
  async function handleChangeLocation() {
    if (isChangingLocation) return;
    setIsChangingLocation(true);
    try {
      const picked = await pickSpaceFolder();
      if (picked === null) return;
      const parent = await invoke<{ path: string; name: string }>(
        'validate_space_folder',
        { path: picked }
      );
      onParentChange({ parentPath: parent.path, parentName: parent.name });
    } catch (error) {
      console.error('Changing the space location failed:', error);
      locationShake.shake();
    } finally {
      setIsChangingLocation(false);
    }
  }

  // Create is the only place the folder is made: `<parent>/<trimmed name>`.
  // Buttons are never disabled — an empty/invalid name shakes the Space Name
  // card and creates nothing. Rust refuses an existing folder (never
  // overwritten, never renamed or suffixed); that, like any failure, shakes
  // the card too. Clicks while creating, or after it succeeded, are ignored.
  async function handleCreate() {
    if (isCreating || isCreated) return;
    if (!isValidSpaceName(draft.name)) {
      shake();
      return;
    }
    setIsCreating(true);
    try {
      await invoke('create_space_folder', {
        parentPath: draft.parentPath,
        name: draft.name.trim(),
      });
      setIsCreated(true);
    } catch (error) {
      console.error('Creating the space folder failed:', error);
      shake();
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className="space-details">
      <div
        className={['space-details__card', shakeClassName]
          .filter(Boolean)
          .join(' ')}
      >
        <label className="space-details__label" htmlFor="space-details-name">
          Space Name
        </label>
        <Input
          id="space-details-name"
          className="space-details__input"
          hasBackground={false}
          hasBorder={false}
          value={draft.name}
          aria-invalid={!isValidSpaceName(draft.name)}
          onChange={(event) => handleNameChange(event.target.value)}
        />
      </div>
      <div
        className={[
          'space-details__card',
          'space-details__card--with-action',
          locationShake.shakeClassName,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <div className="space-details__card-content">
          <span className="space-details__label">Location</span>
          <span className="space-details__path" title={draft.parentPath}>
            {draft.parentName}/
          </span>
        </div>
        <Button
          className="space-details__change-button"
          variant="filled"
          // size="small"
          onClick={() => void handleChangeLocation()}
        >
          Change
        </Button>
      </div>
      <Button
        className="space-details__button"
        variant="primary"
        onClick={() => void handleCreate()}
      >
        Create
      </Button>
    </div>
  );
}
