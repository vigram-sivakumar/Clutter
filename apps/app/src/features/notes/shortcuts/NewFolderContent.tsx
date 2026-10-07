import { useState } from 'react';
import type { FormEvent } from 'react';
import { AppIcon } from '@shared/icon';
import { Input } from '@components/input/Input';
import { Button } from '@components/button/Button';
import { ChangeIconPicker } from '@components/change-icon-picker/ChangeIconPicker';
import { useOverlay } from '@components/overlay/hooks/useOverlay';
import { getFolderTitlePlaceholder } from '@core/presentation/PageDisplayPlaceholders';

import './NewFolderContent.css';

/**
 * The wording of this one name + description dialog. The New folder modal is the default; a variant
 * ("Create template") supplies its own words and reuses everything else — field layout, duplicate
 * validation, the submit lifecycle, styling.
 */
export interface NewFolderContentLabels {
  readonly title: string;
  readonly nameLabel: string;
  readonly namePlaceholder: string;
  /** The error under the name field for a duplicate name. */
  readonly duplicateMessage: (name: string) => string;
  readonly submitLabel: string;
  readonly failureMessage: string;
}

export const NEW_FOLDER_LABELS: NewFolderContentLabels = {
  title: 'New folder',
  nameLabel: 'Folder name',
  namePlaceholder: getFolderTitlePlaceholder(),
  duplicateMessage: (name) => `A folder named “${name}” already exists.`,
  submitLabel: 'Create',
  failureMessage: 'Failed to create folder.',
};

export interface NewFolderContentProps {
  onClose(): void;
  /** Wording; absent = the New folder modal's own. */
  labels?: NewFolderContentLabels;
  /** Prefilled values — the user edits them before submitting. */
  initialName?: string;
  initialDescription?: string;
  /** Whether the footer offers the emoji picker (a folder has an icon here; a template does not). Default true. */
  withIcon?: boolean;
  /** Shows a Cancel button beside the submit button. Default false (the header's close button is the folder modal's only dismiss). */
  withCancel?: boolean;
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
export function NewFolderContent({
  onClose,
  canCreate,
  onSubmit,
  labels = NEW_FOLDER_LABELS,
  initialName = '',
  initialDescription = '',
  withIcon = true,
  withCancel = false,
}: NewFolderContentProps) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
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
      setSubmitError(error instanceof Error ? error.message : labels.failureMessage);
    }
  };

  return (
    <form className="new-folder" onSubmit={handleSubmit} noValidate>
      <div className="new-folder__header">
        <span className="new-folder__title">{labels.title}</span>
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
          placeholder={labels.namePlaceholder}
          aria-label={labels.nameLabel}
          autoFocus
          aria-invalid={isDuplicate}
          onChange={(event) => setName(event.target.value)}
        />
        {isDuplicate && (
          <span className="new-folder__error" role="alert">
            {labels.duplicateMessage(trimmed)}
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
        {withIcon && (
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
        )}
        {!withIcon && <span />}
        <div className="new-folder__actions">
          {withCancel && (
            <Button type="button" variant="ghost" size="medium" interaction="subtle" onClick={onClose}>
              Cancel
            </Button>
          )}
          <Button
            type="submit"
            className="new-folder__create-button"
            variant="primary"
            size="medium"
            disabled={!canSubmit}
          >
            {labels.submitLabel}
          </Button>
        </div>
      </div>

      {withIcon && (
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
      )}
    </form>
  );
}
