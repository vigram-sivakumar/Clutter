import { useState } from 'react';

import { Button } from '@components/button/Button';
import { isValidSpaceFolderName } from '@core/vault/ingest/spaceFolderName';
import { Input } from '../input/Input';
import { useRejectShake } from '../property-list/useRejectShake';
import './SpaceDetails.css';
import { AppIcon } from '@shared/icon';

/**
 * A space the user is setting up. Nothing exists on disk yet: the folder
 * will be `<parentPath>/<name.trim()>`, created only when the user confirms.
 * The parent is fixed by the caller (the user's Documents folder).
 */
export interface NewSpaceDraft {
  /** Absolute path of the folder the space will be created in. */
  parentPath: string;
  /** That folder's display name, e.g. "Documents". */
  parentName: string;
  /** Space name — also the new folder's name. Starts empty. */
  name: string;
}

/** The outcome of creating the folder: its path, or a message to show. */
export type CreateFolderResult = { path: string } | { error: string };

interface SpaceDetailsProps {
  draft: NewSpaceDraft;
  onNameChange: (name: string) => void;
  /** Creates `<parent>/<name>` — explicitly, on the user's Create. Never overwrites an existing folder. */
  onCreateFolder: (name: string) => Promise<CreateFolderResult>;
  /** Opens the created folder as the space: `null` on success, otherwise a message to show. */
  onOpenSpace: (path: string) => Promise<string | null>;
  /** Returns to the previous screen; the Back button only renders when provided. */
  onBack?: () => void;
}

export function SpaceDetails({
  draft,
  onNameChange,
  onCreateFolder,
  onOpenSpace,
  onBack,
}: SpaceDetailsProps) {
  const { shakeClassName, shake } = useRejectShake();
  const [isCreating, setIsCreating] = useState(false);
  // What the last Create attempt reported, shown under the name; cleared as soon as the name is edited.
  const [error, setError] = useState<string | null>(null);
  // Set once the folder exists, so a retry after a failed open opens it instead of trying to create it
  // again (which would rightly be refused). The folder is never deleted on a failed open.
  const [createdPath, setCreatedPath] = useState<string | null>(null);

  // An unusable name shakes the whole Space Name card; the input is left exactly as typed. Editing the
  // name starts over: a folder created for the previous name stays on disk, but is no longer the target.
  function handleNameChange(name: string) {
    if (!isValidSpaceFolderName(name)) shake();
    setError(null);
    setCreatedPath(null);
    onNameChange(name);
  }

  // Where the folder will be created: the parent, plus the trimmed name once
  // the user has typed one (never a default name).
  const folderName = draft.name.trim();

  // Create makes `<parent>/<trimmed name>` and then opens it as the space. Buttons are never
  // disabled — an invalid name, a taken name or any failure shakes the Space Name card and says why
  // under it; nothing else changes. Clicks while in flight are ignored.
  async function handleCreate() {
    if (isCreating) return;
    setError(null);
    if (createdPath === null && !isValidSpaceFolderName(draft.name)) {
      setError('Enter a name without slashes or colons.');
      shake();
      return;
    }
    setIsCreating(true);
    try {
      let path = createdPath;
      if (path === null) {
        const created = await onCreateFolder(folderName);
        if ('error' in created) {
          setError(created.error);
          shake();
          return;
        }
        path = created.path;
        setCreatedPath(path);
      }
      const openError = await onOpenSpace(path);
      if (openError !== null) {
        setError(`${openError} The folder was created; press Create to try opening it again.`);
        shake();
      }
    } catch (caught) {
      console.error('Creating the space failed:', caught);
      setError('Something went wrong creating the space.');
      shake();
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className="space-details">
      {onBack && (
        <Button
          className="space-details__back"
          variant="ghost"
          interaction='subtle'
          leading={<AppIcon icon="arrowLeft" />}
          onClick={onBack}
        >
          Go back
        </Button>
      )}
        <div className="space-details__avatar-picker" role="button">
          <span className="space-details__initial">M</span>
        </div>
      <div className="space-details__main">
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
            aria-invalid={!isValidSpaceFolderName(draft.name)}
            onChange={(event) => handleNameChange(event.target.value)}
          />
        </div>
        {error && (
          <span className="space-details__error" role="alert">
            {error}
          </span>
        )}
        <div className="space-details__card">
          <div className="space-details__card-content">
            <span className="space-details__label">Location</span>
            <span
              className="space-details__path"
              title={`${draft.parentPath}/${folderName}`}
            >
              {draft.parentName}/{folderName}
            </span>
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

    </div>
  );
}
