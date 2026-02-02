/**
 * Lexical Serialization
 *
 * Convert between EditorState and JSON for storage.
 * Provides backward compatibility with plain text blocks.
 */

import type { EditorState, LexicalEditor } from 'lexical';
import { $getRoot, $createParagraphNode, $createTextNode } from 'lexical';

/**
 * Serialize EditorState to JSON string
 */
export function serializeEditorState(editorState: EditorState): string {
  return JSON.stringify(editorState.toJSON());
}

/**
 * Deserialize JSON string to EditorState
 *
 * Handles both:
 * - Lexical JSON (new format)
 * - Plain text (backward compatibility)
 */
export function deserializeEditorState(
  editor: LexicalEditor,
  content: string
): EditorState | null {
  if (!content) {
    return null;
  }

  try {
    // Try parsing as Lexical JSON
    const parsed = JSON.parse(content);

    // ✅ Strict Lexical editorState shape check
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      parsed.root &&
      parsed.root.children &&
      parsed.root.type === 'root'
    ) {
      return editor.parseEditorState(parsed);
    }

    // If JSON but not Lexical format, return null
    return null;
  } catch {
    // Not JSON, treat as plain text
    return null;
  }
}

/**
 * Load plain text into editor
 * Used for backward compatibility with Step 2 blocks
 */
export function loadPlainText(editor: LexicalEditor, text: string): void {
  editor.update(() => {
    const root = $getRoot();
    root.clear();

    const paragraph = $createParagraphNode();
    const textNode = $createTextNode(text);
    paragraph.append(textNode);
    root.append(paragraph);
  });
}

/**
 * Extract plain text from EditorState
 * Useful for search, preview, etc.
 */
export function getPlainTextFromState(editorState: EditorState): string {
  return editorState.read(() => {
    const root = $getRoot();
    return root.getTextContent();
  });
}
