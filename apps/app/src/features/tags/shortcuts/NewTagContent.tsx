import { useState } from 'react';
import type { FormEvent } from 'react';
import { AppIcon } from '@shared/icon';
import { Input } from '@components/input/Input';
import { Button } from '@components/button/Button';
import { ChangeIconPicker } from '@components/change-icon-picker/ChangeIconPicker';
import { useOverlay } from '@components/overlay/hooks/useOverlay';
import type { NewTagNameCheck } from '@core/application/tags/TagOperations';

import './NewTagContent.css';

export interface NewTagContentProps {
  onClose(): void;
  /**
   * Whether a typed name can become a tag, and the exact name it would get
   * (TagOperations.checkNewTagName) — the same normalization and grammar
   * creation itself applies. A plain callback, never a TagOperations import
   * here (UI/Features must not import a concrete application-layer class
   * directly, ARCHITECTURE_RULES rule 6).
   */
  validateName(input: string): NewTagNameCheck;
  /** Creates the tag definition (never any `#tag` in a note) and resolves once it is durable; rejects on failure. */
  onSubmit(name: string, icon: string | undefined): Promise<void>;
}

/** The inline message for each reason a name can't be used — copy lives here, the domain only says why. */
function messageFor(check: Exclude<NewTagNameCheck, { ok: true }>): string | undefined {
  switch (check.reason) {
    case 'empty':
      return undefined;
    case 'invalid':
      return 'Use letters, numbers, hyphens or underscores, with at least one letter.';
    case 'duplicate':
      return `A tag named “${check.existingName ?? ''}” already exists.`;
  }
}

/**
 * The New tag modal's content, rendered inside the shared `Dialog` by
 * `TagsShortcuts`. UI state only: the draft name/emoji and the submit
 * request's lifecycle. It unmounts whenever its Dialog closes, so every open
 * starts fresh without any reset logic.
 */
export function NewTagContent({ onClose, validateName, onSubmit }: NewTagContentProps) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState<string | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | undefined>(undefined);
  const emojiPicker = useOverlay<HTMLButtonElement>();

  const check = validateName(name);
  const nameMessage = check.ok ? undefined : messageFor(check);
  const canSubmit = check.ok && !isSubmitting;


  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!check.ok || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(undefined);

    try {
      await onSubmit(check.name, icon);
      onClose();
    } catch (error) {
      setIsSubmitting(false);
      setSubmitError(error instanceof Error ? error.message : 'Failed to create tag.');
    }
  };

  return (
    <form className="new-tag" onSubmit={handleSubmit} noValidate>
      <div className="new-tag__header">
        <span className="new-tag__title">New tag</span>
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

      <div className="new-tag__field">
        <Input
          className="new-tag__input"
          value={name}
          placeholder="Tag name"
          aria-label="Tag name"
          autoFocus
          aria-invalid={nameMessage !== undefined}
          onChange={(event) => setName(event.target.value)}
        />
        {nameMessage && (
          <span className="new-tag__error" role="alert">
            {nameMessage}
          </span>
        )}
      </div>

      {submitError && (
        <span className="new-tag__error" role="alert">
          {submitError}
        </span>
      )}

      <div className="new-tag__footer">
        <Button
          ref={emojiPicker.anchorRef}
          type="button"
          className="new-tag__emoji-button"
          variant="ghost"
          size="medium"
          interaction="subtle"
          leading={icon ? <span className="new-tag__emoji">{icon}</span> : <AppIcon icon="smile" />}
          aria-label={icon ? `Emoji ${icon}. Change emoji` : 'Choose emoji'}
          onClick={emojiPicker.toggle}
        />
        <Button
          type="submit"
          className="new-tag__create-button"
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
