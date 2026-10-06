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

  // The caret is now at the very end of the content, but placing a Range
  // via script (unlike typing) does not reliably trigger the browser's
  // own "scroll the caret into view" behavior — confirmed the gap this
  // exists to close: a long value autoFocused into a `.editable-text`
  // narrower than its content left the caret positioned correctly but
  // scrolled out of view, at the start of the text, until the user typed
  // a character or manually scrolled. Since the caret always sits at the
  // rightmost edge of the content here, scrolling fully right reveals it
  // directly — a no-op when the content already fits (`scrollWidth`
  // equals the visible width).
  element.scrollLeft = element.scrollWidth;
}

/** The caret's rect, or null when the browser can't measure one (no selection in `element`). */
function getCaretRect(element: HTMLElement): DOMRect | null {
  const selection = window.getSelection();

  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) {
    return null;
  }

  const range = selection.getRangeAt(0);

  if (!element.contains(range.startContainer)) {
    return null;
  }

  const rect = range.getClientRects()[0] ?? range.getBoundingClientRect();

  return rect.height === 0 && rect.width === 0 && rect.top === 0 ? null : rect;
}

/**
 * A collapsed range at the very start/end of the text, anchored inside a text node: a collapsed
 * range at an *element* boundary has no client rects (so it can't be measured), one inside a text
 * node does. Null when the field has no text.
 */
function getEdgeRange(element: HTMLElement, edge: 'top' | 'bottom'): Range | null {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let target: Text | null = null;

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if ((node as Text).length === 0) {
      continue;
    }

    target = node as Text;

    if (edge === 'top') {
      break;
    }
  }

  if (!target) {
    return null;
  }

  const range = document.createRange();
  range.setStart(target, edge === 'top' ? 0 : target.length);
  range.collapse(true);

  return range;
}

/**
 * Whether the caret sits on the field's first (`'top'`) or last (`'bottom'`) visual line — the only
 * place ArrowUp/ArrowDown should leave the field rather than move within it. An empty field is on
 * both. A caret that can't be measured is treated as *not* on an edge, so the browser's own
 * movement (never a surprise jump) wins whenever this can't tell.
 */
function isCaretOnEdgeLine(element: HTMLElement, edge: 'top' | 'bottom'): boolean {
  if ((element.textContent ?? '') === '') {
    return true;
  }

  const caret = getCaretRect(element);

  if (!caret) {
    return false;
  }

  const edgeRect = getEdgeRange(element, edge)?.getClientRects()[0];

  if (!edgeRect) {
    return false;
  }

  return Math.abs(caret.top - edgeRect.top) < Math.max(caret.height, edgeRect.height) / 2;
}

/** Places the caret on `element`'s first/last visual line at the position nearest `clientX`. */
function placeCaretAtEdge(element: HTMLElement, edge: 'top' | 'bottom', clientX: number) {
  const selection = window.getSelection();

  if (!selection || (element.textContent ?? '') === '') {
    return;
  }

  const edgeRange = getEdgeRange(element, edge);

  if (!edgeRange) {
    return;
  }

  const edgeRect = edgeRange.getClientRects()[0];
  const box = element.getBoundingClientRect();
  const x = Math.min(Math.max(clientX, box.left + 1), box.right - 1);
  const y = edgeRect ? edgeRect.top + edgeRect.height / 2 : box.top + 1;

  // `caretRangeFromPoint` (WebKit/Blink) and `caretPositionFromPoint` (Gecko, newer Blink) are the
  // two spellings of the same hit test; neither exists in jsdom, which falls through to the edge.
  const doc = document as Document & {
    caretRangeFromPoint?(x: number, y: number): Range | null;
    caretPositionFromPoint?(x: number, y: number): { offsetNode: Node; offset: number } | null;
  };
  let hit: Range | null = null;

  if (doc.caretRangeFromPoint) {
    hit = doc.caretRangeFromPoint(x, y);
  } else if (doc.caretPositionFromPoint) {
    const position = doc.caretPositionFromPoint(x, y);

    if (position) {
      hit = document.createRange();
      hit.setStart(position.offsetNode, position.offset);
    }
  }

  const target = hit && element.contains(hit.startContainer) ? hit : edgeRange;
  target.collapse(true);

  selection.removeAllRanges();
  selection.addRange(target);
}

/**
 * A single-line (`editable-text--nowrap`) field scrolls sideways to keep the caret visible. When its
 * box is only as wide as its content — an empty field in a shrink-to-fit parent is a sliver — the
 * browser scrolls it on the first keystroke, before the box has grown, and the offset then stays,
 * clipping the first letters of text that now fits. Once the content fits, there is nothing to scroll:
 * put the offset back to the start. (A caret at the very end of a box exactly as wide as its text
 * sits just past the edge; that overhang is not a reason to scroll, so a couple of pixels are allowed.)
 * Also run just after an autoFocus mount: the box may still have been settling when focus scrolled it.
 */
const CARET_ALLOWANCE_PX = 2;

function resetScrollWhenContentFits(element: HTMLDivElement) {
  if (element.scrollLeft !== 0 && element.scrollWidth - element.clientWidth <= CARET_ALLOWANCE_PX) {
    element.scrollLeft = 0;
  }
}

/**
 * How long the reject-shake CSS animation (EditableText.css's
 * `editable-text--shake`) plays. Exported so another field giving the same
 * "that value isn't accepted" feedback (the date Property input) reuses
 * this exact animation rather than a second one.
 */
export const SHAKE_DURATION_MS = 240;

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
      className,
      isDisabled = false,
      autoFocus = false,
      onCommit,
      onEdit,
      onFlush,
      onCancel,
      onEditingEnd,
      onSubmit,
      onNavigate,
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
      focusAtEdge(edge, clientX) {
        const element = editableElementRef.current;

        if (!element) {
          return;
        }

        element.focus();
        placeCaretAtEdge(element, edge, clientX);
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
        if (element) {
          requestAnimationFrame(() => resetScrollWhenContentFits(element));
        }
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function handleInput(event: FormEvent<HTMLDivElement>) {
      updateEmptyState(event.currentTarget);
      resetScrollWhenContentFits(event.currentTarget);
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

      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        if (!onNavigate || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) {
          return;
        }

        const direction = event.key === 'ArrowUp' ? 'up' : 'down';
        const element = event.currentTarget;

        if (!isCaretOnEdgeLine(element, direction === 'up' ? 'top' : 'bottom')) {
          return;
        }

        // The caret's x, read before focus moves; an empty field has no measurable caret, so it
        // offers its own left edge.
        const x = getCaretRect(element)?.left ?? element.getBoundingClientRect().left;

        if (onNavigate(direction, x)) {
          event.preventDefault();
        }

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
        className={[
          'editable-text',
          className,
          isShaking && 'editable-text--shake',
        ]
          .filter(Boolean)
          .join(' ')}
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
