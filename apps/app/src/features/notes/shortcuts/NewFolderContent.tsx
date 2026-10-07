import { useState } from 'react';
import type { FormEvent } from 'react';
import { AppIcon } from '@shared/icon';
import { Input } from '@components/input/Input';
import { Button } from '@components/button/Button';
import { ChangeIconPicker } from '@components/change-icon-picker/ChangeIconPicker';
import { useOverlay } from '@components/overlay/hooks/useOverlay';
import { getFolderTitlePlaceholder } from '@core/presentation/PageDisplayPlaceholders';

import './NewFolderContent.css';

export interface NewFolderContentProps {
  onClose(): void;
  /**
   * The same synchronous sibling-name pre-check the Notes sidebar's inline
   * "New Folder" row uses (FolderOperations.canCreate) — a plain callback,
   * never a FolderOperations import here (ARCHITECTURE_RULES rule 6).
   */
  canCreate(name: string): boolean;
  /** Creates the root folder and resolves once it is persisted; rejects on failure. `icon` (an emoji) and `description` are optional. */
  onSubmit(name: string, icon: string | undefined, description: string | undefined): Promise<void>;
}

/**
 * The New folder modal's content. UI state only: the draft name and the
 * submit request's lifecycle. It unmounts whenever its Dialog closes, so
 * every open starts fresh.
 */
export function NewFolderContent({ onClose, canCreate, onSubmit }: NewFolderContentProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState<string | undefined>(undefined);
  const emojiPicker = useOverlay<HTMLButtonElement>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | undefined>(undefined);

  const trimmed = name.trim();
  const isDuplicate = trimmed !== '' && !canCreate(trimmed);
  const canSubmit = trimmed !== '' && !isDuplicate && !isSubmitting;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(undefined);

    try {
      await onSubmit(trimmed, icon, description.trim() === '' ? undefined : description.trim());
      onClose();
    } catch (error) {
      setIsSubmitting(false);
      setSubmitError(error instanceof Error ? error.message : 'Failed to create folder.');
    }
  };

  return (
    <form className="new-folder" onSubmit={handleSubmit} noValidate>
      <div className="new-folder__header">
        <span className="new-folder__title">New folder</span>
        <Button
          type="button"
          size="small"
          variant="ghost"
          interaction="subtle"
          isIconOnly
          aria-label="Close"
          onClick={onClose}
        >
          <AppIcon icon="dismiss" />
        </Button>
      </div>

      <div className="new-folder__field">
        <Input
          value={name}
          placeholder={getFolderTitlePlaceholder()}
          aria-label="Folder name"
          autoFocus
          aria-invalid={isDuplicate}
          onChange={(event) => setName(event.target.value)}
        />
        {isDuplicate && (
          <span className="new-folder__error" role="alert">
            A folder named “{trimmed}” already exists.
          </span>
        )}
      </div>

      <Input
        multiline
        value={description}
        placeholder="Description"
        aria-label="Description"
        onChange={(event) => setDescription(event.target.value)}
      />

      {submitError && (
        <span className="new-folder__error" role="alert">
          {submitError}
        </span>
      )}

      <div className="new-folder__footer">
        <Button
          ref={emojiPicker.anchorRef}
          type="button"
          className="new-folder__emoji-button"
          variant="ghost"
          size="medium"
          interaction="subtle"
          leading={icon ? <span className="new-folder__emoji">{icon}</span> : <AppIcon icon="smile" />}
          aria-label={icon ? `Emoji ${icon}. Change emoji` : 'Choose emoji'}
          onClick={emojiPicker.toggle}
        />
        <Button
          type="submit"
          className="new-folder__create-button"
          variant="primary"
          size="medium"
          disabled={!canSubmit}
        >
          Create
        </Button>
      </div>

      <ChangeIconPicker
        anchorRef={emojiPicker.anchorRef}
        open={emojiPicker.open}
        onClose={emojiPicker.hide}
        hasIcon={icon !== undefined}
        onSelect={(emoji) => {
          emojiPicker.hide();
          setIcon(emoji);
        }}
        onRemove={() => {
          emojiPicker.hide();
          setIcon(undefined);
        }}
      />
    </form>
  );
}
