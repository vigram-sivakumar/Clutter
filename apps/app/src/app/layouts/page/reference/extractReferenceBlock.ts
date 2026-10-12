import type { SyntaxNode } from '@lezer/common';

import { sharedMarkdownParser } from '@features/markdown/render/sharedMarkdownParser';

/**
 * Work limits for a reference preview, not a visual contract (the preview's own max-height clips what is
 * left). A block over either limit is not extracted: the caller falls back to the compact one-line
 * rendering instead of building a large editor view for a References entry.
 */
export const MAX_REFERENCE_BLOCK_LINES = 12;
export const MAX_REFERENCE_BLOCK_CHARS = 1500;

const LIST_NODES: ReadonlySet<string> = new Set([
  'BulletList',
  'OrderedList',
  'EmojiList',
]);

/** Top-level blocks that stand on their own: lifted out whole, they parse exactly as they did in place. */
const STANDALONE_BLOCKS: ReadonlySet<string> = new Set([
  'Paragraph',
  'ATXHeading1',
  'ATXHeading2',
  'ATXHeading3',
  'ATXHeading4',
  'ATXHeading5',
  'ATXHeading6',
  'SetextHeading1',
  'SetextHeading2',
  'Blockquote',
  'FencedCode',
  'Table',
]);

const contains = (node: SyntaxNode, offset: number): boolean =>
  node.from <= offset && offset < node.to;

function childContaining(
  node: SyntaxNode,
  offset: number,
  accept: (name: string) => boolean
): SyntaxNode | null {
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (accept(child.name) && contains(child, offset)) {
      return child;
    }
  }

  return null;
}

/** The innermost list item holding `offset`, through any nesting. It owns its whole subtree (sub-items included). */
function innermostListItem(
  list: SyntaxNode,
  offset: number
): SyntaxNode | null {
  let item: SyntaxNode | null = null;
  let currentList: SyntaxNode | null = list;

  while (currentList) {
    const next: SyntaxNode | null = childContaining(
      currentList,
      offset,
      (name) => name === 'ListItem'
    );

    if (!next) {
      break;
    }

    item = next;
    currentList = childContaining(next, offset, (name) => LIST_NODES.has(name));
  }

  return item;
}

/** Removes up to `width` leading spaces or tabs from every line, so a nested item reads as a top-level one. */
function dedent(text: string, width: number): string {
  if (width === 0) {
    return text;
  }

  return text
    .split('\n')
    .map((line) => {
      let removed = 0;

      while (
        removed < width &&
        (line[removed] === ' ' || line[removed] === '\t')
      ) {
        removed++;
      }

      return line.slice(removed);
    })
    .join('\n');
}

/** A reference's block: where it starts (the identity of the block) and its text, if it can be lifted out. */
export interface ReferenceBlock {
  /** Offset of the start of the block's first line — equal for every reference inside the same block. */
  readonly from: number;
  /** The block as its own document, or `null` (see `extractReferenceBlock`). */
  readonly text: string | null;
}

const lineStartOf = (markdown: string, offset: number): number =>
  markdown.lastIndexOf('\n', offset - 1) + 1;

/**
 * The smallest complete Markdown block containing `offset` (a reference's position in `markdown`), as its own
 * document — or `text: null` when there is no block that can be lifted out safely: a block type that doesn't
 * stand on its own, or one over the work limits above.
 *
 *   - a paragraph, heading, blockquote, fenced code block or table: the whole top-level block;
 *   - inside a list: the innermost list item with its sub-items, dedented to the left margin.
 *
 * `from` is the block's identity either way, so references in one block can be grouped even when its text
 * can't be shown; with no block at all it is the start of the reference's own line.
 *
 * The text is a verbatim slice of the source, so every construct inside it (inline styles, wiki links, tags,
 * dates, embeds, task markers) is parsed and decorated by the editor's own pipeline exactly as it is in the note.
 * Parsed with `sharedMarkdownParser` — the editor's grammar, with no editor state involved — once for all
 * `offsets`.
 */
export function extractReferenceBlocks(
  markdown: string,
  offsets: readonly number[]
): ReferenceBlock[] {
  const root = sharedMarkdownParser.parse(markdown).topNode;

  return offsets.map((offset) => {
    const top = childContaining(root, offset, () => true);

    if (!top) {
      return { from: lineStartOf(markdown, offset), text: null };
    }

    const block = LIST_NODES.has(top.name)
      ? innermostListItem(top, offset)
      : STANDALONE_BLOCKS.has(top.name)
        ? top
        : null;

    if (!block) {
      return { from: lineStartOf(markdown, top.from), text: null };
    }

    const lineStart = lineStartOf(markdown, block.from);
    const text = dedent(
      markdown.slice(lineStart, block.to),
      block.from - lineStart
    ).replace(/\s+$/, '');

    if (
      text.length === 0 ||
      text.length > MAX_REFERENCE_BLOCK_CHARS ||
      text.split('\n').length > MAX_REFERENCE_BLOCK_LINES
    ) {
      return { from: lineStart, text: null };
    }

    return { from: lineStart, text };
  });
}

/** The block's text for a single reference — `extractReferenceBlocks` for one offset. */
export function extractReferenceBlock(
  markdown: string,
  offset: number
): string | null {
  return extractReferenceBlocks(markdown, [offset])[0]!.text;
}
