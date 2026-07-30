import { useEffect, useRef } from 'react';

export interface MarkdownEditorProps {
  readonly markdown: string;
  readonly onCommit?: (markdown: string) => void;
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
export function MarkdownEditor({ markdown, onCommit }: MarkdownEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);

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
