import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type CompositionEvent,
  type FocusEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react';

import type { EditableTextHandle, EditableTextProps } from './EditableText.types';

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

    function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
      if (isComposingRef.current || event.nativeEvent.isComposing) {
        return;
      }

      if (event.key !== 'Enter' && event.key !== 'Escape') {
        return;
      }

      if (event.key === 'Escape') {
        // Escape always discards the draft, even valid, changed text —
        // revert the visible content now so handleBlur has nothing left to
        // compare against value, and so a consumer that keeps the element
        // mounted after a cancel doesn't show stale typed text.
        isEscapingRef.current = true;
        syncTextContent(event.currentTarget, value);
      } else {
        isSubmittingRef.current = true;
      }

      event.preventDefault();
      event.currentTarget.blur();
    }

    // Blur represents the end-of-session boundary for the current editing
    // session. EditableText only emits the proposed value (via onCommit),
    // the fact that the session ended (via onEditingEnd), and — only for
    // Enter specifically — onSubmit. It does not mutate application state
    // itself, and it does not know what "cancel" or "advance focus" means
    // to any particular consumer.
    function handleBlur(event: FocusEvent<HTMLDivElement>) {
      const committedValue = event.currentTarget.textContent ?? '';
      const wasEscaped = isEscapingRef.current;
      const wasSubmitted = isSubmittingRef.current;
      isEscapingRef.current = false;
      isSubmittingRef.current = false;

      updateEmptyState(event.currentTarget);

      // Emit the proposed value only when this wasn't an Escape, and the
      // committed text differs from the last value accepted by the parent.
      if (!wasEscaped && committedValue !== value) {
        onCommit(committedValue);
      }

      // A continuous-commit consumer's onFlush must not fire on an escaped
      // blur — an escaped session already committed nothing via onCommit,
      // but a consumer using onEdit (continuous commit, per keystroke) has
      // already been advancing its own pending state independent of this
      // blur; firing onFlush here would force-persist that pending state
      // despite the user explicitly cancelling. onCancel is the signal
      // such a consumer needs instead, to revert whatever it already
      // committed via onEdit back to its last-known-good value.
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
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
      />
    );
  }
);
