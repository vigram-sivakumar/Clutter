import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

export interface MarkdownEditorProps {
  readonly markdown: string;
  /**
   * Fires on every content change (typing, paste, deletion) — commits into
   * the document session's Committed stage only, no persistence
   * (autosave-execution-model.md §3.1). Called unconditionally on every
   * native input event; the session's own no-op guard is what filters out
   * anything that isn't a real change, so this component doesn't need its
   * own diffing.
   */
  readonly onEdit?: (markdown: string) => void;
  /**
   * Fires on blur — a save request, not a payload (autosave-execution-model.md
   * §0): asks the system to make this session durable if it isn't already,
   * never carries content itself. The content to persist is always
   * whatever the session's own current revision holds by the time this
   * fires, per onEdit's own already-committed calls.
   */
  readonly onFlush?: () => void;
}

/**
 * Imperative handle for callers that need to move focus into an
 * already-mounted editor from outside — e.g. the page title's Enter key
 * advancing focus here. Mirrors EditableTextHandle's shape but is kept as
 * its own, separate type: MarkdownEditor isn't an EditableText, and a
 * one-method interface isn't worth cross-importing for.
 */
export interface MarkdownEditorHandle {
  focus(): void;
}

/**
 * Feature-level Markdown editing surface.
 *
 * Responsibilities:
 * - Present editable Markdown content.
 * - Own future editing interactions.
 * - Raise editing events to the application layer.
 * - Expose a stable editing API to feature components.
 *
 * This initial implementation is intentionally read-only. Editing,
 * keyboard handling, selection management, and save orchestration will be
 * introduced incrementally.
 */
export const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(
  function MarkdownEditor({ markdown, onEdit, onFlush }, ref) {
    const editorRef = useRef<HTMLDivElement | null>(null);

    useImperativeHandle(ref, () => ({
      focus() {
        editorRef.current?.focus();
      },
    }));

    useEffect(() => {
      const editor = editorRef.current;

      if (!editor) {
        return;
      }

      // While this editor has focus, its own DOM is authoritative over
      // itself — a markdown prop update here is this same editor's own
      // committed content round-tripping back through
      // commit()->notify()->re-render (see onInput below), not an
      // external change. Overwriting the DOM in that case would clobber
      // in-progress typing/cursor position and reset native undo (found
      // during M6's pre-implementation behavior audit). Only sync from
      // the prop while genuinely unfocused — an external change (a
      // different view of the same document, a future Sync-reconciled
      // edit) is the only thing this branch exists to handle.
      if (document.activeElement === editor) {
        return;
      }

      if (editor.textContent !== markdown) {
        editor.textContent = markdown;
      }
    }, [markdown]);

    function handleInput() {
      const editor = editorRef.current;

      if (!editor || !onEdit) {
        return;
      }

      onEdit(editor.textContent ?? '');
    }

    function handleBlur() {
      // Blur is a persistence event only — it asks the system to flush
      // whatever the document model already holds. It does not also
      // mutate that model: onEdit (native input events) is the only
      // source of content changes, keeping the contract unambiguous
      // rather than making blur do double duty.
      onFlush?.();
    }

    return (
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onBlur={handleBlur}
      />
    );
  }
);
