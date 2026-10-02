import { useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

import { Input } from '@components/input/Input';

interface TextPropertyValueProps {
  /** The property's name — used only as the field's accessible label. */
  name: string;
  value: string;
  /**
   * Fired when a changed value commits — a non-escaped blur whose text
   * differs from `value`. Same discrete-commit shape as
   * EditableText.onCommit; the caller decides how (and whether) to persist.
   */
  onCommit(value: string): void;
}

/**
 * The `text` Property's value editor — a multiline value, not a
 * title-style single-line field. Reuses Input's `multiline` mode (which
 * already wraps and auto-grows) rather than a second textarea.
 *
 * Follows EditableText's established editing convention: React owns the
 * committed `value`; the field owns the draft only while focused. A
 * changed draft commits on blur, Escape reverts. The one deliberate
 * difference is Enter: it inserts a newline (native textarea behavior)
 * instead of submitting.
 */
export function TextPropertyValue({ name, value, onCommit }: TextPropertyValueProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const isEscapingRef = useRef(false);

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Escape' || event.nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();
    isEscapingRef.current = true;
    event.currentTarget.blur();
  }

  function handleBlur() {
    const committedValue = draft;
    const wasEscaped = isEscapingRef.current;
    isEscapingRef.current = false;
    setDraft(null);

    if (wasEscaped || committedValue === null || committedValue === value) {
      return;
    }

    onCommit(committedValue);
  }

  return (
    <Input
      className="property-list__value property-list__text-input"
      multiline
      rows={1}
      hasBackground={false}
      hasBorder={false}
      aria-label={name}
      value={draft ?? value}
      onFocus={() => setDraft(value)}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
    />
  );
}
