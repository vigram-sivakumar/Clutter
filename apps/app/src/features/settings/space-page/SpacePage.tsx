import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@components/button/Button';
import { Confirmation } from '@components/confirmation/Confirmation';
import { Dialog } from '@components/dialog/Dialog';
import { Input } from '@components/input/Input';
import { SpaceAvatarPicker } from '@components/space-avatar-picker/SpaceAvatarPicker';
import { AppIcon } from '@shared/icon';
import { draftForExistingFolder } from '@components/space-details/SpaceDetails';
import { isValidSpaceFolderName } from '@core/vault/ingest/spaceFolderName';
import { Pill } from '@components/property-list/Pill';
import { CHANGE_LOCATION_LABEL } from '@components/missing-space-dialog/MissingSpaceDialog';
import { SettingsEntry } from '../settings-entry/SettingsEntry';
import { SettingsGroup } from '../settings-group/SettingsGroup';
import { SettingsSection } from '../settings-section/SettingsSection';
import './SpacePage.css';

/**
 * Whether saving a new name first asks "Rename space?". Off while the plain edit-and-save flow is being tried out;
 * the confirmation itself is kept (below) and comes back by flipping this, or per page with `confirmBeforeRename`.
 */
export const CONFIRM_RENAME_BY_DEFAULT = false;

interface SpacePageProps {
  /** The Space's display name (its folder's name). */
  name: string;
  /** The Space's folder, absolute. */
  path: string;
  /** Absent: no Remove space. */
  onRemove?: () => void;
  /**
   * Renames this Space's folder. Present only for the open Space; absent, the name is read-only. Resolves `{}` once
   * carried out (the Space is then reopened under its new name, so this page is usually gone by then) or `{ error }`
   * with what to show when nothing was changed. All the lifecycle work is the caller's; this only asks.
   */
  onRename?: (newName: string) => Promise<{ error?: string }>;
  /** Ask "Rename space?" before renaming. Defaults to `CONFIRM_RENAME_BY_DEFAULT`. */
  confirmBeforeRename?: boolean;
  /** The Space's avatar, drawn by the caller with the shared `SpaceAvatar` (never a second drawing of it). Absent: none shown. */
  avatar?: ReactNode;
  /** Whether the Space has an avatar of its own, so the picker can offer Remove. */
  hasAvatar?: boolean;
  /**
   * Changes the Space's avatar (`undefined` removes it): an emoji, or an image given by the absolute path of the file the
   * user chose. Resolves `{}` once saved or `{ error }`. Present only where the avatar can be changed (the open Space);
   * absent, the avatar is just shown. All the saving is the caller's.
   */
  onChangeAvatar?: (
    avatar: { type: 'emoji'; emoji: string } | { type: 'image'; src: string } | undefined
  ) => Promise<{ error?: string }>;
  /** The Space's folder is missing (detected by the registry): shows a "Missing" badge beside "Location". */
  missing?: boolean;
  /**
   * Recovers a missing Space: the same location-recovery flow as the Space-not-found dialog. Its button is shown in the
   * Location entry only for a missing Space, and only when this is given.
   */
  onChangeLocation?: () => void;
  /** The Space is changing under this page (see `SettingsSpace.busy`): nothing here can be started. */
  busy?: boolean;
}

/**
 * A Space's own page: the same two entries the Space details dialog uses, its name and its location. A Space's name
 * is its folder's name, so editing it renames the folder — offered only for the open Space (`onRename`), and only
 * after a confirmation, because the Space is closed and reopened to do it. The location is never editable here.
 */
export function SpacePage({
  name,
  path,
  onRemove,
  onRename,
  confirmBeforeRename = CONFIRM_RENAME_BY_DEFAULT,
  busy = false,
  avatar,
  hasAvatar = false,
  onChangeAvatar,
  missing = false,
  onChangeLocation,
}: SpacePageProps) {
  const folder = draftForExistingFolder(path);
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);
  const [draft, setDraft] = useState(name);
  const [confirmingRename, setConfirmingRename] = useState(false);
  const [renaming, setRenaming] = useState(false);
  // The name is only editable after the pencil is clicked; Enter or leaving the field then asks to save it.
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const avatarRef = useRef<HTMLDivElement>(null);
  // A missing Space's folder can't be renamed or have its avatar rewritten, so neither is offered for it.
  const canChangeAvatar = onChangeAvatar !== undefined && !busy && !missing;
  const [error, setError] = useState<string | null>(null);
  // A rename in flight is never started twice, however fast the clicks come.
  const startedRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    []
  );

  const trimmed = draft.trim();
  const canRename = onRename !== undefined && !missing;
  const changed = canRename && trimmed !== name;
  const valid = isValidSpaceFolderName(draft);
  const showEditButton = canRename && !editing && !renaming && !busy;

  useEffect(() => {
    if (!editing) return;
    const input = inputRef.current;
    input?.focus();
    input?.setSelectionRange(input.value.length, input.value.length);
  }, [editing]);

  function startEditing() {
    setDraft(name);
    setError(null);
    setEditing(true);
  }

  /** Back to the saved name, nothing asked. */
  function cancelEditing() {
    setEditing(false);
    setDraft(name);
    setError(null);
  }

  // Enter, or the field losing focus. A name that is unchanged just closes the editor; a valid new one asks to be
  // confirmed (the Space is closed and reopened to rename its folder). On Enter an invalid name stays open to be
  // fixed; on blur it is dropped, since the user has gone elsewhere.
  function commit(source: 'enter' | 'blur') {
    if (!editing || renaming) return;
    if (!changed) return cancelEditing();
    if (!valid) {
      if (source === 'blur') return cancelEditing();
      setError('Enter a name without slashes or colons');
      return;
    }
    setEditing(false);
    if (confirmBeforeRename) setConfirmingRename(true);
    else void rename();
  }

  /** Not confirmed: back to the saved name. */
  function cancelRename() {
    setConfirmingRename(false);
    setDraft(name);
  }

  async function changeAvatar(next: Parameters<NonNullable<typeof onChangeAvatar>>[0]) {
    setAvatarPickerOpen(false);
    if (!onChangeAvatar) return;
    setAvatarError(null);
    try {
      const result = await onChangeAvatar(next);
      if (mountedRef.current && result.error) setAvatarError(result.error);
    } catch (caught) {
      console.error('Changing the space avatar failed:', caught);
      if (mountedRef.current) setAvatarError('Couldn’t save the space settings');
    }
  }

  async function rename() {
    if (!onRename || startedRef.current) return;
    startedRef.current = true;
    setConfirmingRename(false);
    setRenaming(true);
    setError(null);
    try {
      const result = await onRename(trimmed);
      if (mountedRef.current && result.error) setError(result.error);
    } catch (caught) {
      console.error('Renaming the space failed:', caught);
      if (mountedRef.current) setError('Couldn’t rename the space');
    } finally {
      startedRef.current = false;
      if (mountedRef.current) setRenaming(false);
    }
  }

  return (
    <>
    {/* The Space itself: its avatar and its name and location. Removing it is a separate group below. */}
    <SettingsSection className="space-page__section">
    {avatar && (
      <>
        {/* The same way the Space details dialog changes it: click the avatar, pick an emoji or an image. */}
        <div
          ref={avatarRef}
          className={['space-page__avatar', canChangeAvatar && 'space-page__avatar--editable', missing && 'space-page__avatar--static'].filter(Boolean).join(' ')}
          {...(canChangeAvatar
            ? {
                role: 'button',
                tabIndex: 0,
                'aria-label': 'Change avatar',
                'aria-haspopup': 'dialog' as const,
                onClick: () => setAvatarPickerOpen(true),
                onKeyDown: (event: React.KeyboardEvent) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setAvatarPickerOpen(true);
                  }
                },
              }
            : {})}
        >
          {avatar}
        </div>
        {canChangeAvatar && (
          <SpaceAvatarPicker
            anchorRef={avatarRef}
            open={avatarPickerOpen}
            onClose={() => setAvatarPickerOpen(false)}
            hasAvatar={hasAvatar}
            alignment="start"
            onSelectEmoji={(emoji) => void changeAvatar({ type: 'emoji', emoji })}
            onUploadImage={(src) => void changeAvatar({ type: 'image', src })}
            onRemove={() => void changeAvatar(undefined)}
          />
        )}
        {avatarError && (
          <span className="space-page__error" role="alert">
            {avatarError}
          </span>
        )}
      </>
    )}
    <SettingsGroup>
      <SettingsEntry
        description="Space name"
        labelFor="space-page-name"
        trailing={
          showEditButton && (
            // The same edit button the Space details dialog uses for its location: default size, default icon.
            <Button isIconOnly variant="ghost" aria-label="Edit space name" onClick={startEditing}>
              <AppIcon icon="edit" />
            </Button>
          )
        }
        footer={
          <>
            <Input
              id="space-page-name"
              className="space-page__input"
              hasBackground={false}
              hasBorder={false}
              ref={inputRef}
              value={editing || confirmingRename || renaming ? draft : name}
              readOnly={!editing}
              disabled={renaming || busy}
              aria-invalid={editing && (!valid || error !== null)}
              onChange={(event) => {
                setDraft(event.target.value);
                setError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  commit('enter');
                } else if (event.key === 'Escape' && editing) {
                  event.stopPropagation();
                  cancelEditing();
                }
              }}
              onBlur={() => commit('blur')}
            />
            {error && (
              <span className="space-page__error" role="alert">
                {error}
              </span>
            )}
          </>
        }
      />
      <SettingsEntry
        description="Location"
        labelFor="space-page-location"
        descriptionAdornment={
          missing && (
            <span className="space-page__missing">
              <Pill size="small">
                <AppIcon icon="exclamation" size={16} slotSize={16} />
                Missing
              </Pill>
            </span>
          )
        }
        trailing={
          missing &&
          onChangeLocation && (
            <Button variant="primary" size="small" disabled={busy} onClick={onChangeLocation}>
              {CHANGE_LOCATION_LABEL}
            </Button>
          )
        }
        footer={
          <Input
            id="space-page-location"
            className="space-page__input"
            hasBackground={false}
            hasBorder={false}
            value={`${folder.parentName}/${folder.name}`}
            title={path}
            readOnly
          />
        }
      />
    </SettingsGroup>
    </SettingsSection>
    {onRemove && (
      <SettingsGroup className="settings-group--bare">
        <SettingsEntry
          title="Remove space"
          description="Removes this Space from Clutter. Its files and folders will remain on your device"
          footer={
            <Button
              variant="danger"
              size="small"
              disabled={busy}
              onClick={() => setConfirmingRemoval(true)}
            >
              Remove space
            </Button>
          }
        />
      </SettingsGroup>
    )}
    <Dialog open={confirmingRename} onClose={cancelRename} size="medium">
      <Confirmation
        title="Rename space?"
        description={`Clutter will close and reopen “${name}” to rename its folder to “${trimmed}”. Your changes are saved first`}
        confirmLabel="Rename"
        confirmVariant="primary"
        onConfirm={() => void rename()}
        onCancel={cancelRename}
      />
    </Dialog>
    {/* Removing is confirmed first, for the open Space too. */}
    <Dialog open={confirmingRemoval} onClose={() => setConfirmingRemoval(false)} size="medium">
      <Confirmation
        title="Remove space?"
        description="Remove this Space from Clutter? Its files and folders will remain on your device. You can add it again later"
        confirmLabel="Remove space"
        onConfirm={() => {
          setConfirmingRemoval(false);
          onRemove?.();
        }}
        onCancel={() => setConfirmingRemoval(false)}
      />
    </Dialog>
    </>
  );
}
