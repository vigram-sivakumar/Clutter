import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

import { Button } from '@components/button/Button';
import { Input } from '../input/Input';
import { useRejectShake } from '../property-list/useRejectShake';
import { pickSpaceFolder } from './pickSpaceFolder';
import './SpaceDetails.css';
import { AppIcon } from '@shared/icon';

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
  /** The folder was created and opened as the space; the caller shows its workspace. */
  onSpaceOpened: (path: string) => void;
}

export function SpaceDetails({
  draft,
  onNameChange,
  onParentChange,
  onSpaceOpened,
}: SpaceDetailsProps) {
  const { shakeClassName, shake } = useRejectShake();
  const locationShake = useRejectShake();
  const [isChangingLocation, setIsChangingLocation] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  // Set once the folder exists, so a retry after a failed open doesn't try to
  // create it again (which Rust would rightly refuse).
  const [createdPath, setCreatedPath] = useState<string | null>(null);

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

  // Where the folder will be created: the parent, plus the trimmed name once
  // the user has typed one (never a default name).
  const folderName = draft.name.trim();

  // Create makes `<parent>/<trimmed name>` and then opens it as the space
  // (Rust `open_space`: persists it and reshapes this same window for the
  // workspace; the caller then switches screens — no new window).
  // Buttons are never disabled — an empty/invalid name shakes the Space Name
  // card and creates nothing. A folder that already exists is not an error:
  // Rust leaves it untouched (never overwritten, renamed or suffixed) and we
  // open it as the space. Any real failure shakes the card. Clicks while in
  // flight are ignored.
  async function handleCreate() {
    if (isCreating) return;
    if (createdPath === null && !isValidSpaceName(draft.name)) {
      shake();
      return;
    }
    setIsCreating(true);
    try {
      let path = createdPath;
      if (path === null) {
        const created = await invoke<{ path: string }>('create_space_folder', {
          parentPath: draft.parentPath,
          name: folderName,
        });
        path = created.path;
        setCreatedPath(path);
      }
      onSpaceOpened(await invoke<string>('open_space', { path }));
    } catch (error) {
      console.error('Creating the space failed:', error);
      shake();
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className="space-details">
      <div className="space-details__main">
        <div className="space-details__icon-picker" role="button">
          <span className="space-details__initial">M</span>
        </div>
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
            <span
              className="space-details__path"
              title={`${draft.parentPath}/${folderName}`}
            >
              {draft.parentName}/{folderName}
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
