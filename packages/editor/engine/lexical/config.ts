/**
 * Lexical Editor Configuration
 *
 * Base configuration for per-block Lexical editors.
 * Now with rich text support (Step 3).
 */

import { InitialConfigType } from '@lexical/react/LexicalComposer';
import { getEditorNodes } from './nodes';

/**
 * Create Lexical config for a block editor
 */
export function createBlockEditorConfig(): InitialConfigType {
  return {
    namespace: 'BlockEditor',
    theme: {
      // Text formatting
      text: {
        bold: 'editor-text-bold',
        italic: 'editor-text-italic',
        underline: 'editor-text-underline',
        strikethrough: 'editor-text-strikethrough',
        code: 'editor-text-code',
      },
      // Links
      link: 'editor-link',
      // Paragraphs
      paragraph: 'editor-paragraph',
      // Headings
      heading: {
        h1: 'editor-heading-h1',
        h2: 'editor-heading-h2',
        h3: 'editor-heading-h3',
      },
      // Quotes
      quote: 'editor-quote',
      // Code blocks
      code: 'editor-code',
      // Lists
      list: {
        ul: 'editor-list-ul',
        ol: 'editor-list-ol',
        listitem: 'editor-list-item',
      },
    },
    onError: (error: Error) => {
      console.error('[Lexical Error]', error);
    },
    // Rich text nodes
    nodes: getEditorNodes(),
  };
}
