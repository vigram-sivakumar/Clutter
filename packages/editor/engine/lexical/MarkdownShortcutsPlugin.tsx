/**
 * Markdown Shortcuts Plugin
 *
 * Enables real-time markdown transformation as you type.
 * - **text** → bold
 * - *text* → italic
 * - # heading → heading block
 * - - list → bullet list
 * etc.
 */

import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin';
import { MARKDOWN_TRANSFORMERS } from './markdownTransformers';

/**
 * Plugin that enables markdown shortcuts
 *
 * Usage:
 * - Type **text** and press space → converts to bold
 * - Type # and space at start → converts to heading
 * - Type - and space at start → converts to list
 */
export function MarkdownPlugin() {
  return <MarkdownShortcutPlugin transformers={MARKDOWN_TRANSFORMERS} />;
}
