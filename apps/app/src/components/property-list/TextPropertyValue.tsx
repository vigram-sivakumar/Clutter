import { useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

import { Input } from '@components/input/Input';

import type { PropertyEditability } from './PropertyList.types';
import { PropertyValueCell } from './PropertyValueCell';

type TextPropertyValueProps = {
  /** The property's name — used only as the field's accessible label. */
  name: string;
  value: string;
} & PropertyEditability<string>;

/**
 * The `text` Property's value. `editable` (supplied by the adapter, never
 * inferred here) picks the state: read-only renders the plain value;
 * editable renders the in-place multiline editor.
 */
export function TextPropertyValue(props: TextPropertyValueProps) {
  if (!props.editable) {
    return <PropertyValueCell>{props.value}</PropertyValueCell>;
  }

  return <TextPropertyEditor name={props.name} value={props.value} onCommit={props.onCommit} />;
}

interface TextPropertyEditorProps {
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
 * Editable state — a multiline value, not a title-style single-line field.
 * Reuses Input's `multiline` mode (which already wraps and auto-grows)
 * rather than a second textarea.
 *
 * Follows EditableText's established editing convention: React owns the
 * committed `value`; the field owns the draft only while focused. A
 * changed draft commits on blur, Escape reverts. The one deliberate
 * difference is Enter: it inserts a newline (native textarea behavior)
 * instead of submitting.
 */
function TextPropertyEditor({ name, value, onCommit }: TextPropertyEditorProps) {
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

  const isEditing = draft !== null;

  return (
    <Input
      className="property-list__value property-list__input property-list__text-input"
      multiline
      rows={1}
      // Input's own background/border, shown only while editing — at rest
      // the value reads as plain text like every other Property value.
      hasBackground={isEditing}
      hasBorder={isEditing}
      aria-label={name}
      placeholder="Empty"
      value={draft ?? value}
      onFocus={() => setDraft(value)}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
    />
  );
}
