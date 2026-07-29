import { MarkdownEditor } from './MarkdownEditor';

/**
 * Renders the body of a note.
 *
 * Responsibilities:
 * - Compose the generic PageBody layout for notes.
 * - Supply the current note content.
 *
 * Editing behavior will be introduced by composing a dedicated Markdown editor
 * inside this component. PageBody intentionally remains a layout primitive.
 */
export interface NoteBodyProps {
  readonly markdown: string;
  readonly onCommit?: (markdown: string) => void;
}

export function NoteBody({ markdown, onCommit }: NoteBodyProps) {
  return <MarkdownEditor markdown={markdown} onCommit={onCommit} />;
}
