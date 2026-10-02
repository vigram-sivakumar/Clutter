import { useState } from 'react';
import type { KeyboardEvent } from 'react';

import { Input } from '@components/input/Input';

import type { PropertyEditability } from './PropertyList.types';
import { PropertyValueCell } from './PropertyValueCell';
import { useRejectShake } from './useRejectShake';

type NumberPropertyValueProps = {
  /** The property's name — used only as the field's accessible label. */
  name: string;
  /** The canonical numeric value, or null when absent. Never a formatted string. */
  value: number | null;
} & PropertyEditability<number | null>;

/**
 * A plain decimal number: optional sign, digits with an optional fraction
 * (or a bare fraction like `.5`), optional exponent. Deliberately stricter
 * than `Number(text)`, which also accepts `0x1f`, `Infinity`, and `''`.
 */
const NUMBER_PATTERN = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

/**
 * Reads typed text as a `number` Property value: the trimmed text as a
 * finite number when it is a plain decimal number (NUMBER_PATTERN), else
 * null. Empty text is also null — the caller decides that it means "clear".
 */
export function parseNumberPropertyInput(text: string): number | null {
  const trimmed = text.trim();

  if (!NUMBER_PATTERN.test(trimmed)) {
    return null;
  }

  const number = Number(trimmed);

  return Number.isFinite(number) ? number : null;
}

const numberFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 20 });

/**
 * Display string for a `number` Property value — locale grouping and
 * decimal separator (`1,234.5`). Display only; the stored value stays
 * the number itself.
 */
export function formatNumberPropertyValue(value: number): string {
  return numberFormat.format(value);
}

/**
 * The `number` Property's value. `editable` (supplied by the adapter, never
 * inferred here) picks the state: read-only renders the formatted number
 * as plain text; editable renders a single-line Input.
 */
export function NumberPropertyValue(props: NumberPropertyValueProps) {
  if (!props.editable) {
    return (
      <PropertyValueCell>
        {props.value === null ? null : formatNumberPropertyValue(props.value)}
      </PropertyValueCell>
    );
  }

  return <NumberPropertyEditor name={props.name} value={props.value} onCommit={props.onCommit} />;
}

interface NumberPropertyEditorProps {
  name: string;
  value: number | null;
  /** Fired with a valid number, or null when the text is emptied. */
  onCommit(value: number | null): void;
}

/**
 * Editable state — same commit rules as the URL and date editors: the
 * text is a free draft while focused; Enter or blur commits it only if it
 * is a valid number (parseNumberPropertyInput). Enter on an invalid draft
 * keeps the text and focus and plays EditableText's reject shake; blur
 * with an invalid draft discards it and restores the last valid value.
 * Emptying the text clears the value.
 *
 * At rest the field shows the formatted number; focusing swaps in the raw
 * number (`String(value)`), so editing never round-trips through a
 * locale-formatted string. A text field with `inputMode="decimal"` rather
 * than `type="number"`, whose native field silently reports `''` for
 * invalid text and changes the value on scroll.
 */
function NumberPropertyEditor({ name, value, onCommit }: NumberPropertyEditorProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const { shakeClassName, shake } = useRejectShake();

  const isEditing = draft !== null;

  /** Commits the draft when it is valid (or emptied); returns whether it was accepted. */
  function commitDraft(text: string): boolean {
    if (text.trim() === '') {
      if (value !== null) {
        onCommit(null);
      }
      return true;
    }

    const number = parseNumberPropertyInput(text);

    if (number === null) {
      return false;
    }

    if (number !== value) {
      onCommit(number);
    }

    return true;
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();

    if (draft !== null && !commitDraft(draft)) {
      shake();
      return;
    }

    setDraft(null);
  }

  function handleBlur() {
    if (draft !== null) {
      commitDraft(draft);
    }

    setDraft(null);
  }

  const restingText = value === null ? '' : formatNumberPropertyValue(value);

  return (
    <Input
      className={['property-list__value property-list__input', shakeClassName]
        .filter(Boolean)
        .join(' ')}
      hasBackground={isEditing}
      hasBorder={isEditing}
      aria-label={name}
      inputMode="decimal"
      placeholder="Empty"
      value={draft ?? restingText}
      onFocus={() => setDraft(value === null ? '' : String(value))}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
    />
  );
}
