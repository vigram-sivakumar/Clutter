import { syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';

/**
 * The Markdown block a paste lands in, when that block changes what the pasted content may become:
 * `code` (a fenced or indented code block — content is literal), `list` (a list item — a top-level block would
 * break it) or `quote` (a blockquote — a block would lose its `>`). Innermost wins; null is ordinary text.
 */
export type PasteContext = 'code' | 'list' | 'quote';

const CONTEXT_BY_NODE: Readonly<Record<string, PasteContext>> = {
  FencedCode: 'code',
  CodeBlock: 'code',
  ListItem: 'list',
  Blockquote: 'quote',
};

export function pasteContextAt(state: EditorState, pos: number): PasteContext | null {
  for (let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, -1); node; node = node.parent) {
    const context = CONTEXT_BY_NODE[node.name];
    if (context) {
      return context;
    }
  }
  return null;
}
