import { useEffect, useRef, useState } from 'react';

import { Button } from '@components/button/Button';
import { RoundIconButton } from '@components/button/RoundIconButton';
import {
  SpaceAvatar,
  type SpaceAvatarChoice,
} from '@components/space-avatar/SpaceAvatar';
import { SpaceAvatarPicker } from '@components/space-avatar-picker/SpaceAvatarPicker';
import { isValidSpaceFolderName } from '@core/vault/ingest/spaceFolderName';
import { VaultPath } from '@core/vault/ingest/VaultPath';
import { SettingsEntry } from '@features/settings/settings-entry/SettingsEntry';
import { Input } from '../input/Input';
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
  /**
   * The folder is the open Space, which can't be renamed underneath the running Application: its name stays
   * read-only. Only meaningful with `existingPath`.
   */
  nameLocked?: boolean;
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
  /**
   * Renames the existing folder at `path` to `name`, in place — on the user's Create, when the name was changed.
   * The caller replaces `draft` with the renamed folder's. Without it (or with `draft.nameLocked`) an existing
   * folder's name is read-only.
   */
  onRenameFolder?: (path: string, name: string) => Promise<CreateFolderResult>;
  /** Creates `<parent>/<name>` — explicitly, on the user's Create. Never overwrites an existing folder. */
  onCreateFolder?: (name: string) => Promise<CreateFolderResult>;
  /**
   * Opens the folder as the space, with the avatar chosen for it (none: `undefined`): `null` on success,
   * otherwise a message to show.
   */
  onOpenSpace: (
    path: string,
    avatar?: SpaceAvatarChoice
  ) => Promise<string | null>;
  /** Returns to the previous screen; the Go back button renders when this is provided (and `hasGoBack`). */
  onBack?: () => void;
  /** Dismisses the screen; the close (×) button renders when this is provided (and `isDismissible`). */
  onClose?: () => void;
  /**
   * Lets the user choose a different folder: the caller shows the picker and replaces `draft` with the
   * chosen folder's (its name and location). The Change button renders only when this is provided.
   */
  onChangeFolder?: () => Promise<void>;
  /** Shows the Change button (needs `onChangeFolder`). Defaults to true. */
  hasChangeFolder?: boolean;
  /** Shows the Go back button (needs `onBack`). Defaults to true. */
  hasGoBack?: boolean;
  /** Shows the "New space" heading. Defaults to true. */
  hasTitle?: boolean;
  /** Shows the close (×) button (needs `onClose`). Defaults to true. */
  isDismissible?: boolean;
}

export function SpaceDetails({
  draft,
  onNameChange,
  onAvatarChange,
  resolveImageUrl,
  onCreateFolder,
  onRenameFolder,
  onOpenSpace,
  onBack,
  onClose,
  onChangeFolder,
  hasChangeFolder = true,
  hasGoBack = true,
  hasTitle = true,
  isDismissible = true,
}: SpaceDetailsProps) {
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const avatarRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isChanging, setIsChanging] = useState(false);
  // Set once the folder exists, so a retry after a failed open opens it instead of trying to create it
  // again (which would rightly be refused). The folder is never deleted on a failed open.
  const [createdPath, setCreatedPath] = useState<string | null>(null);

  // Editing the name starts over: a folder created for the previous name stays on disk, but is no longer
  // the target.
  function handleNameChange(name: string) {
    setCreatedPath(null);
    onNameChange(name);
  }

  // On arrival the name field is focused, with the caret after any existing text. Read-only (an existing
  // folder's own name) has nothing to type, so it's left alone.
  useEffect(() => {
    const input = nameInputRef.current;
    if (!input || input.readOnly) return;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }, []);

  // A different folder replaces the whole draft, so a folder created for the previous one is forgotten.
  async function handleChangeFolder() {
    if (!onChangeFolder || isChanging) return;
    setIsChanging(true);
    try {
      await onChangeFolder();
      setCreatedPath(null);
    } catch (caught) {
      console.error('Choosing a different folder failed:', caught);
    } finally {
      setIsChanging(false);
    }
  }

  const folderName = draft.name.trim();
  const isExisting = draft.existingPath !== undefined;
  // An existing folder's name is editable when the caller can rename it and it isn't the open Space.
  const canRename =
    isExisting && onRenameFolder !== undefined && !draft.nameLocked;
  const nameReadOnly = isExisting && !canRename;
  // The avatar shows the name's first character as it's typed; nothing shows until then.
  const avatarInitial = Array.from(folderName)[0]?.toUpperCase();

  // Create makes `<parent>/<trimmed name>` and then opens it as the space. An unusable name or a failure
  // leaves the screen as it is (failures are only logged until the app-wide toast exists). Clicks while in
  // flight are ignored.
  async function handleCreate() {
    if (isCreating) return;
    if (
      createdPath === null &&
      (!isExisting || canRename) &&
      !isValidSpaceFolderName(draft.name)
    ) {
      return;
    }
    setIsCreating(true);
    try {
      let path = createdPath ?? draft.existingPath ?? null;
      // A changed name renames the existing folder first; nothing is opened or registered if that fails.
      if (
        canRename &&
        createdPath === null &&
        draft.existingPath !== undefined &&
        folderName !== VaultPath.filename(draft.existingPath)
      ) {
        const renamed = await onRenameFolder(draft.existingPath, folderName);
        if ('error' in renamed) {
          console.error('Renaming the space failed:', renamed.error);
          return;
        }
        path = renamed.path;
      }
      if (path === null) {
        const created = (await onCreateFolder?.(folderName)) ?? {
          error: 'Something went wrong creating the space',
        };
        if ('error' in created) {
          console.error('Creating the space failed:', created.error);
          return;
        }
        path = created.path;
        setCreatedPath(path);
      }
      const openError = await onOpenSpace(path, draft.avatar);
      if (openError !== null) {
        console.error('Opening the space failed:', openError);
      }
    } catch (caught) {
      console.error('Creating the space failed:', caught);
    } finally {
      setIsCreating(false);
    }
  }

  const showGoBack = hasGoBack && onBack !== undefined;
  const showClose = isDismissible && onClose !== undefined;

  return (
    <div className="space-details">
      {(showGoBack || hasTitle || showClose) && (
        <div className="space-details__title">
          {showGoBack && (
            <Button
              className="space-details__back"
              variant="ghost"
              interaction="subtle"
              leading={
                <span className="icon-badge">
                  <AppIcon icon="arrowLeft" />
                </span>
              }
              onClick={onBack}
            >
              Go back
            </Button>
          )}
          {hasTitle && (
            <h2 className="space-details__modal-title">New space</h2>
          )}
          {showClose && (
            <RoundIconButton icon="dismiss" aria-label="Close" onClick={onClose} />
          )}
        </div>
      )}

      <div className="space-details__main">
        <SettingsEntry
          description="Space name"
          labelFor="space-details-name"
          footer={
            <Input
              id="space-details-name"
              ref={nameInputRef}
              className="space-details__input"
              hasBackground={false}
              hasBorder={false}
              value={draft.name}
              readOnly={nameReadOnly}
              aria-invalid={
                !nameReadOnly && !isValidSpaceFolderName(draft.name)
              }
              onChange={(event) => handleNameChange(event.target.value)}
            />
          }
          trailing={
            (draft.avatar || avatarInitial) && (
              <>
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
                    avatarInitial
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
              </>
            )
          }
        />
        <SettingsEntry
          description="Location"
          labelFor="space-details-location"
          trailing={
            hasChangeFolder &&
            onChangeFolder && (
              <Button
                isIconOnly
                interaction="subtle"
                aria-label="Change location"
                onClick={() => void handleChangeFolder()}
              >
                <AppIcon icon="edit" />
              </Button>
            )
          }
          footer={
            <Input
              id="space-details-location"
              className="space-details__input"
              hasBackground={false}
              hasBorder={false}
              value={`${draft.parentName}/${folderName}`}
              title={`${draft.parentPath}/${folderName}`}
              readOnly
            />
          }
        />
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
