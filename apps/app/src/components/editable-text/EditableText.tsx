import {
  useLayoutEffect,
  useRef,
  type CompositionEvent,
  type FocusEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react';

import type { EditableTextProps } from './EditableText.types';

import './EditableText.css';

function updateEmptyState(element: HTMLDivElement | null) {
  if (!element) {
    return;
  }

  element.dataset.empty = String((element.textContent ?? '') === '');
}

function syncTextContent(element: HTMLDivElement | null, value: string) {
  if (!element) {
    return;
  }

  if (element.textContent !== value) {
    element.textContent = value;
  }

  updateEmptyState(element);
}

/**
 * EditableText is a reusable UI primitive for inline text editing.
 * - It owns only the browser editing experience.
 * - It does not own document state, persistence, validation, or business rules.
 * - Committed values are delegated through `onCommit`.
 * - The parent decides whether to accept, reject, or persist the change.
 */
export function EditableText({
  value,
  placeholder,
  isDisabled = false,
  onCommit,
}: EditableTextProps) {
  const editableElementRef = useRef<HTMLDivElement>(null);
  const isComposingRef = useRef(false);

  /**
   * React owns the committed value.
   * The browser owns the draft while the element is focused.
   */
  useLayoutEffect(() => {
    const editableElement = editableElementRef.current;

    if (!editableElement) {
      return;
    }

    const isFocused = document.activeElement === editableElement;

    if (isFocused) {
      return;
    }

    syncTextContent(editableElement, value);
  }, [value]);

  function handleInput(event: FormEvent<HTMLDivElement>) {
    updateEmptyState(event.currentTarget);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (isComposingRef.current || event.nativeEvent.isComposing) {
      return;
    }

    if (event.key !== 'Enter' && event.key !== 'Escape') {
      return;
    }

    event.preventDefault();
    event.currentTarget.blur();
  }

  // Blur represents the commit boundary for the current editing session.
  // EditableText only emits the proposed value.
  // It does not mutate application state itself.
  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    const committedValue = event.currentTarget.textContent ?? '';

    updateEmptyState(event.currentTarget);

    // Emit the proposed value only when the committed text differs from
    // the last value accepted by the parent.
    if (committedValue !== value) {
      onCommit(committedValue);
    }
  }

  function handleCompositionStart(_event: CompositionEvent<HTMLDivElement>) {
    isComposingRef.current = true;
  }

  function handleCompositionEnd(_event: CompositionEvent<HTMLDivElement>) {
    isComposingRef.current = false;
  }

  return (
    <div
      ref={editableElementRef}
      className="editable-text"
      contentEditable={!isDisabled}
      suppressContentEditableWarning
      spellCheck={false}
      role="textbox"
      aria-disabled={isDisabled}
      data-placeholder={placeholder}
      tabIndex={isDisabled ? -1 : 0}
      onInput={handleInput}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      onCompositionStart={handleCompositionStart}
      onCompositionEnd={handleCompositionEnd}
    />
  );
}
