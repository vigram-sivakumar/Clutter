import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

import { Input } from '@components/input/Input';

import { useRejectShake } from './useRejectShake';

interface PillValueEditorProps {
  /** The value being edited — the text the input starts with, and what Escape restores. */
  value: string;
  /** Reads the typed (trimmed, non-empty) text as the new value, or null when it is not a valid one. */
  parse(text: string): string | null;
  /** Whether the new value would repeat another value on this list. */
  isTaken(value: string): boolean;
  /** Fired with the new value when it is a real, allowed change. */
  onCommit(value: string): void;
  /** Ends editing with the value unchanged. */
  onCancel(): void;
}

/**
 * A pill being edited in place — the one editor Tags and Aliases (every pill-list Property) share: a
 * single-line Input standing where the pill was — plain text, no pill surface — its text selected,
 * sized to its content. Same commit rules as the other Property text editors (EditableText's
 * convention): Enter or blur commits; Escape cancels and restores. Text that is unchanged or empty
 * commits nothing (removing is the dismiss button's job). Text that is not a valid value (`parse`) or
 * would repeat another value: Enter keeps editing and plays the reject shake; blur restores the
 * original.
 */
export function PillValueEditor({ value, parse, isTaken, onCommit, onCancel }: PillValueEditorProps) {
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState(value);
  // Escape/Enter end editing themselves; the blur that follows unmounting
  // focus must not act a second time.
  const isDoneRef = useRef(false);
  const { shakeClassName, shake } = useRejectShake();

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  /** Ends editing with the draft; returns false when it was rejected (invalid, or a repeat). */
  function finish(): boolean {
    const text = draft.trim();

    if (text === '' || text === value) {
      isDoneRef.current = true;
      onCancel();
      return true;
    }

    const parsed = parse(text);

    if (parsed === null || isTaken(parsed)) {
      return false;
    }

    isDoneRef.current = true;

    if (parsed === value) {
      onCancel();
    } else {
      onCommit(parsed);
    }
    return true;
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) {
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      if (!finish()) {
        shake();
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      isDoneRef.current = true;
      onCancel();
    }
  }

  function handleBlur() {
    if (isDoneRef.current) {
      return;
    }

    if (!finish()) {
      isDoneRef.current = true;
      onCancel();
    }
  }

  return (
    <Input
      ref={inputRef}
      className={['pill pill--editing', shakeClassName]
        .filter(Boolean)
        .join(' ')}
      hasBackground={false}
      hasBorder={false}
      aria-label={`Edit ${value}`}
      // Grows with the text (field-sizing where supported, else `size`).
      size={Math.max(draft.length, 1)}
      value={draft}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
    />
  );
}
