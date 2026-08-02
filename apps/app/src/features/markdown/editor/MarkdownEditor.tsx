import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

export interface MarkdownEditorProps {
  readonly markdown: string;
  readonly onCommit?: (markdown: string) => void;
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
  function MarkdownEditor({ markdown, onCommit }, ref) {
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

      if (editor.textContent !== markdown) {
        editor.textContent = markdown;
      }
    }, [markdown]);

    function handleBlur() {
      const editor = editorRef.current;

      if (!editor || !onCommit) {
        return;
      }

      const nextMarkdown = editor.textContent ?? '';

      if (nextMarkdown !== markdown) {
        onCommit(nextMarkdown);
      }
    }

    return (
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onBlur={handleBlur}
      />
    );
  }
);
