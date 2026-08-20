import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
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
 * Collapses the caret to the end of `element`'s content — the browser
 * default for a freshly-`.focus()`ed contentEditable is to place it at
 * the *start* instead, which reads as wrong for every rename flow (Note/
 * Folder/Tag row rename, the Tag collection page title): the existing
 * name should be ready to append to, not retype from scratch. A no-op for
 * empty content (every other `autoFocus` consumer today — a brand-new,
 * not-yet-named row, or a page title only autofocused while genuinely
 * untitled), so this is safe to apply unconditionally rather than adding
 * a second "where should the caret start" prop.
 */
function placeCaretAtEnd(element: HTMLDivElement | null) {
  if (!element) {
    return;
  }

  const selection = window.getSelection();

  if (!selection) {
    return;
  }

  const range = document.createRange();
  const textNode = element.firstChild;

  // The common case — `syncTextContent` always sets content via
  // `element.textContent = value`, producing exactly one text-node child —
  // gets a precise character-offset placement. `selectNodeContents` +
  // `collapse(false)` alone would anchor on the *container* with an
  // offset counted in child nodes (1, not the string length), which is
  // still visually "at the end" but not a stable position to assert
  // against; falls back to it only for the no-text-node (empty) case.
  if (textNode instanceof Text) {
    range.setStart(textNode, textNode.length);
    range.collapse(true);
  } else {
    range.selectNodeContents(element);
    range.collapse(false);
  }

  selection.removeAllRanges();
  selection.addRange(range);
}

/** How long the reject-shake CSS animation (EditableText.css) plays. */
const SHAKE_DURATION_MS = 240;

/**
 * EditableText is a reusable UI primitive for inline text editing.
 * - It owns only the browser editing experience.
 * - It does not own document state, persistence, or *what makes a value
 *   valid* — that decision, and any error-message UX for it, belongs to
 *   the caller entirely. It only owns the *reaction* to a rejection
 *   (`onCommit` returning `false`): stay in edit mode, refocus, no
 *   selection, a brief shake — the generic "that didn't work, try again"
 *   feedback every rename-style consumer needs identically.
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
    // Set by handleBlur when a submit was rejected; consumed by
    // handleKeyDown right after its own `.blur()` call returns — see that
    // call site's own comment for why the refocus/caret placement can't
    // happen synchronously *inside* the blur handler itself.
    const needsRefocusRef = useRef(false);

    // Rejected-submit feedback only — not a validation state of any kind.
    // Cleared automatically after the shake animation's own duration so a
    // later, separate render never has to remember to turn it off.
    const [isShaking, setIsShaking] = useState(false);

    useEffect(() => {
      if (!isShaking) {
        return;
      }

      const timeout = setTimeout(() => setIsShaking(false), SHAKE_DURATION_MS);
      return () => clearTimeout(timeout);
    }, [isShaking]);

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
        const element = editableElementRef.current;
        element?.focus();
        placeCaretAtEnd(element);
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

      const element = event.currentTarget;
      element.blur();

      // `.blur()` is synchronous — `handleBlur` (below) runs entirely
      // within this call, including deciding whether the submit was
      // rejected. Refocusing/placing the caret *inside* handleBlur itself
      // doesn't stick: the browser's own post-dispatch blur cleanup runs
      // immediately after blur's listeners finish and clears whatever
      // selection was just set, even though the DOM's activeElement does
      // correctly end up back on this element. Doing it here instead,
      // once `.blur()` has fully returned, sidesteps that entirely.
      if (needsRefocusRef.current) {
        needsRefocusRef.current = false;
        element.focus();
        placeCaretAtEnd(element);
      }
    }

    function handleBlur(event: FocusEvent<HTMLDivElement>) {
      const element = event.currentTarget;
      const committedValue = element.textContent ?? '';
      const wasEscaped = isEscapingRef.current;
      const wasSubmitted = isSubmittingRef.current;
      isEscapingRef.current = false;
      isSubmittingRef.current = false;

      updateEmptyState(element);

      if (wasEscaped) {
        onCancel?.();
        onEditingEnd?.();
        return;
      }

      const hasChanged = committedValue !== value;
      const result = hasChanged ? onCommit(committedValue) : undefined;

      if (result === false) {
        if (wasSubmitted) {
          // A rejected explicit submit (Enter) stays open — refocus with
          // the caret at the end (no selection), shake, and leave the
          // typed text exactly as-is so the user can fix it in place
          // rather than retype from scratch. None of onFlush/onEditingEnd/
          // onSubmit fire: this session hasn't ended.
          needsRefocusRef.current = true;
          setIsShaking(true);
          return;
        }

        // Focus genuinely moved elsewhere while still invalid — cannot be
        // forced to stay open, so this reverts and ends the session
        // exactly like Escape (onCancel, not onFlush).
        syncTextContent(element, value);
        onCancel?.();
        onEditingEnd?.();
        return;
      }

      onFlush?.();
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
        className={isShaking ? 'editable-text editable-text--shake' : 'editable-text'}
        contentEditable={!isDisabled}
        suppressContentEditableWarning
        spellCheck={false}
        role="textbox"
        aria-disabled={isDisabled}
        data-placeholder={placeholder}
        data-shake={isShaking || undefined}
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
