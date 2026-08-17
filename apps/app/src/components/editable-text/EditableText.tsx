import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type ClipboardEvent,
  type CompositionEvent,
  type FocusEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react';

import type {
  EditableTextHandle,
  EditableTextProps,
} from './EditableText.types';

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
 * - Committed values are delegated through `onCommit` (discrete, blur/Enter-only)
 *   and, optionally, `onEdit`/`onFlush` (continuous, every keystroke + unconditional
 *   blur — see EditableTextProps' doc comments for which shape a given consumer wants).
 * - The parent decides whether to accept, reject, or persist the change.
 */
export const EditableText = forwardRef<EditableTextHandle, EditableTextProps>(
  function EditableText(
    {
      value,
      placeholder,
      isDisabled = false,
      autoFocus = false,
      onCommit,
      onEdit,
      onFlush,
      onCancel,
      onEditingEnd,
      onSubmit,
    },
    ref
  ) {
    const editableElementRef = useRef<HTMLDivElement>(null);
    const isComposingRef = useRef(false);
    const isEscapingRef = useRef(false);
    const isSubmittingRef = useRef(false);

    useImperativeHandle(ref, () => ({
      focus() {
        editableElementRef.current?.focus();
      },
    }));

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

    // Focuses once, on mount, for a row that renders already in edit mode
    // rather than one the user clicks into. Deliberately runs once — a
    // later `autoFocus` prop flip isn't a fresh "start editing" moment.
    useLayoutEffect(() => {
      if (autoFocus) {
        editableElementRef.current?.focus();
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function handleInput(event: FormEvent<HTMLDivElement>) {
      updateEmptyState(event.currentTarget);
      onEdit?.(event.currentTarget.textContent ?? '');
    }

    function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
      event.preventDefault();

      const text = event.clipboardData.getData('text/plain');

      document.execCommand('insertText', false, text);
    }

    function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
      if (isComposingRef.current || event.nativeEvent.isComposing) {
        return;
      }

      if (event.key !== 'Enter' && event.key !== 'Escape') {
        return;
      }

      if (event.key === 'Escape') {
        isEscapingRef.current = true;
        syncTextContent(event.currentTarget, value);
      } else {
        isSubmittingRef.current = true;
      }

      event.preventDefault();
      event.currentTarget.blur();
    }

    function handleBlur(event: FocusEvent<HTMLDivElement>) {
      const committedValue = event.currentTarget.textContent ?? '';
      const wasEscaped = isEscapingRef.current;
      const wasSubmitted = isSubmittingRef.current;
      isEscapingRef.current = false;
      isSubmittingRef.current = false;

      updateEmptyState(event.currentTarget);

      if (!wasEscaped && committedValue !== value) {
        onCommit(committedValue);
      }

      if (wasEscaped) {
        onCancel?.();
      } else {
        onFlush?.();
      }

      onEditingEnd?.();

      if (wasSubmitted) {
        onSubmit?.();
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
        onPaste={handlePaste}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
      />
    );
  }
);
