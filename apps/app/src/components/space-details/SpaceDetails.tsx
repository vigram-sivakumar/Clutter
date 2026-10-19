import { useRef, useState } from 'react';

import { Button } from '@components/button/Button';
import {
  SpaceAvatar,
  type SpaceAvatarChoice,
} from '@components/space-avatar/SpaceAvatar';
import { SpaceAvatarPicker } from '@components/space-avatar-picker/SpaceAvatarPicker';
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
  /**
   * Set when the user picked a folder that already exists: it is opened as is on confirm — never created —
   * and `parentPath` / `parentName` / `name` are just that folder's own path, shown read-only.
   */
  existingPath?: string;
  /** The avatar chosen in the picker (an image's `src` is the absolute path of the uploaded file); absent shows the name's initial. */
  avatar?: SpaceAvatarChoice;
}

/** The settings draft for an existing folder, prefilled from its path. */
export function draftForExistingFolder(path: string): NewSpaceDraft {
  const trimmed = path.replace(/[\\/]+$/, '');
  const cut = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  const parentPath =
    cut > 0 ? trimmed.slice(0, cut) : trimmed.slice(0, cut + 1);
  const parentCut = Math.max(
    parentPath.lastIndexOf('/'),
    parentPath.lastIndexOf('\\')
  );
  return {
    parentPath,
    parentName: parentPath.slice(parentCut + 1),
    name: trimmed.slice(cut + 1),
    existingPath: path,
  };
}

/** The outcome of creating the folder: its path, or a message to show. */
export type CreateFolderResult = { path: string } | { error: string };

interface SpaceDetailsProps {
  draft: NewSpaceDraft;
  onNameChange: (name: string) => void;
  /** The avatar picked, or `undefined` when removed. */
  onAvatarChange: (avatar: SpaceAvatarChoice | undefined) => void;
  /** Turns an uploaded image's path into a loadable URL for the preview. */
  resolveImageUrl?: (path: string) => string | null;
  /** Creates `<parent>/<name>` — explicitly, on the user's Create. Never overwrites an existing folder. */
  onCreateFolder?: (name: string) => Promise<CreateFolderResult>;
  /**
   * Opens the folder as the space, with the avatar chosen for it (none: `undefined`): `null` on success,
   * otherwise a message to show.
   */
  onOpenSpace: (path: string, avatar?: SpaceAvatarChoice) => Promise<string | null>;
  /** Returns to the previous screen; the Back button only renders when provided. */
  onBack?: () => void;
  /**
   * Dismisses the screen when there is nothing to go back to: a close (×) button renders in the corner, and
   * only when `onBack` is absent — the screen shows Go back or ×, never both.
   */
  onClose?: () => void;
}

export function SpaceDetails({
  draft,
  onNameChange,
  onAvatarChange,
  resolveImageUrl,
  onCreateFolder,
  onOpenSpace,
  onBack,
  onClose,
}: SpaceDetailsProps) {
  const { shakeClassName, shake } = useRejectShake();
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const avatarRef = useRef<HTMLDivElement>(null);
  const [isCreating, setIsCreating] = useState(false);
  // What the last Create attempt reported, shown under the name; cleared as soon as the name is edited.
  const [error, setError] = useState<string | null>(null);
  // Set once the folder exists, so a retry after a failed open opens it instead of trying to create it
  // again (which would rightly be refused). The folder is never deleted on a failed open.
  const [createdPath, setCreatedPath] = useState<string | null>(null);

  // An unusable name shakes the whole Space name card; the input is left exactly as typed. Editing the
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
  const isExisting = draft.existingPath !== undefined;
  // The avatar shows the name's first character as it's typed; a smile icon is the placeholder until then.
  const avatarInitial = Array.from(folderName)[0]?.toUpperCase();

  // Create makes `<parent>/<trimmed name>` and then opens it as the space. Buttons are never
  // disabled — an invalid name, a taken name or any failure shakes the Space name card and says why
  // under it; nothing else changes. Clicks while in flight are ignored.
  async function handleCreate() {
    if (isCreating) return;
    setError(null);
    if (
      createdPath === null &&
      !isExisting &&
      !isValidSpaceFolderName(draft.name)
    ) {
      setError('Enter a name without slashes or colons');
      shake();
      return;
    }
    setIsCreating(true);
    try {
      let path = createdPath ?? draft.existingPath ?? null;
      if (path === null) {
        // Only an existing folder (opened as is) has no use for it; a draft for a new folder always has one.
        const created = (await onCreateFolder?.(folderName)) ?? {
          error: 'Something went wrong creating the space',
        };
        if ('error' in created) {
          setError(created.error);
          shake();
          return;
        }
        path = created.path;
        setCreatedPath(path);
      }
      const openError = await onOpenSpace(path, draft.avatar);
      if (openError !== null) {
        setError(
          `${openError}. ${isExisting ? 'Press Create' : 'The folder was created; press Create'} to try opening it again`
        );
        shake();
      }
    } catch (caught) {
      console.error('Creating the space failed:', caught);
      setError('Something went wrong creating the space');
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
          interaction="subtle"
          leading={<AppIcon icon="arrowLeft" />}
          onClick={onBack}
        >
          Go back
        </Button>
      )}
      {!onBack && onClose && (
        <Button
          className="space-details__close"
          variant="ghost"
          interaction="subtle"
          size="small"
          isIconOnly
          aria-label="Close"
          onClick={onClose}
        >
          <AppIcon icon="dismiss" />
        </Button>
      )}
      <div
        className="space-details__avatar-picker"
        role="button"
        tabIndex={0}
        aria-label="Change avatar"
        ref={avatarRef}
        onClick={() => setAvatarPickerOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setAvatarPickerOpen(true);
          }
        }}
      >
        {draft.avatar ? (
          <SpaceAvatar
            avatar={draft.avatar}
            folderName={folderName}
            resolveImageUrl={resolveImageUrl}
          />
        ) : (
          <span className="space-details__initial">
            {avatarInitial ?? (
              <AppIcon
                className="space-details__placeholder-icon"
                icon="smile"
                size={40}
                strokeWidth={0.8}
              />
            )}
          </span>
        )}
      </div>
      <SpaceAvatarPicker
        anchorRef={avatarRef}
        open={avatarPickerOpen}
        onClose={() => setAvatarPickerOpen(false)}
        hasAvatar={draft.avatar !== undefined}
        onSelectEmoji={(emoji) => {
          onAvatarChange({ type: 'emoji', emoji });
          setAvatarPickerOpen(false);
        }}
        onUploadImage={(src) => {
          onAvatarChange({ type: 'image', src });
          setAvatarPickerOpen(false);
        }}
        onRemove={() => {
          onAvatarChange(undefined);
          setAvatarPickerOpen(false);
        }}
      />

      <div className="space-details__main">
        <div
          className={['space-details__card', shakeClassName]
            .filter(Boolean)
            .join(' ')}
        >
          <label className="space-details__label" htmlFor="space-details-name">
            Space name
          </label>
          <Input
            id="space-details-name"
            className="space-details__input"
            hasBackground={false}
            hasBorder={false}
            value={draft.name}
            readOnly={isExisting}
            aria-invalid={!isExisting && !isValidSpaceFolderName(draft.name)}
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
