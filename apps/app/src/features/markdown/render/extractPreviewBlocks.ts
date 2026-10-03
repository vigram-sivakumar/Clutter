import type { SyntaxNode } from '@lezer/common';

import { sharedMarkdownParser } from './sharedMarkdownParser';

/**
 * Safeguards for a bounded document preview — *work* limits, not the
 * visual contract (the card's viewport clips whatever is left over). Tuned
 * against the Card view's preview box, a ~9:10 portrait at the grid's
 * 200–300px card widths scaled 0.35: roughly 26–36 lines of 24px text.
 * Three independent limits, because notes spend that box very differently:
 * prose burns characters (one source line wraps to several visible lines),
 * while lists, code and tables burn *source lines* (one line each) and
 * rarely reach the character limit before producing hundreds of DOM nodes.
 */
export interface PreviewLimits {
  /** Source characters of the note considered at all. */
  readonly maxChars: number;
  /** Source lines considered. Bounds list/code/table output, whose visible lines map 1:1 to source lines. */
  readonly maxLines: number;
  /** Top-level blocks kept. */
  readonly maxBlocks: number;
  /**
   * When the last block is incomplete (the cut lands inside it), it is
   * dropped so the preview ends on a whole block — but only if at least
   * this many characters of earlier content are already kept. Below that,
   * dropping would leave the card mostly empty (a short intro followed by
   * one big code block or table), so the block is kept, shortened.
   */
  readonly minFillChars: number;
}

export const DEFAULT_PREVIEW_LIMITS: PreviewLimits = {
  maxChars: 3000,
  maxLines: 60,
  maxBlocks: 40,
  minFillChars: 2000,
};

export interface PreviewExtraction {
  /** The (possibly shortened) source the `blocks` positions refer to — always a prefix of the input, so offsets match the original. */
  readonly text: string;
  /** Top-level blocks, in order, from the existing shared parser. */
  readonly blocks: readonly SyntaxNode[];
  /** Whether anything of the note was left out. */
  readonly truncated: boolean;
}

/** The length of the prefix of `markdown` within the character and line limits, ending at a line break whenever one exists. */
function boundedLength(markdown: string, limits: PreviewLimits): number {
  if (markdown.length <= limits.maxChars && countsWithinLines(markdown, limits.maxLines)) {
    return markdown.length;
  }

  // Everything below works on the character-bounded window only, so a
  // multi-megabyte note is never scanned past the budget.
  const window = markdown.slice(0, limits.maxChars);
  let limit = window.length;

  let index = -1;
  for (let line = 0; line < limits.maxLines; line += 1) {
    index = window.indexOf('\n', index + 1);
    if (index === -1) {
      break;
    }
  }
  if (index !== -1) {
    limit = index;
  }

  // Prefer ending at a line break — but never at the price of most of the
  // content: a long single-line paragraph after a short heading has only the
  // heading's own line break behind the cut, and backing up to it would
  // throw the whole paragraph away. Below `minFillChars` of retained
  // content, cut at the budget instead (a shortened block is still valid).
  const lineBreak = window.lastIndexOf('\n', limit);
  if (lineBreak >= limits.minFillChars || lineBreak === limit) {
    return lineBreak;
  }
  // Never split a surrogate pair (an emoji) at a hard cut.
  const code = window.charCodeAt(limit - 1);
  return code >= 0xd800 && code <= 0xdbff ? limit - 1 : limit;
}

function countsWithinLines(markdown: string, maxLines: number): boolean {
  let breaks = 0;
  for (let i = markdown.indexOf('\n'); i !== -1; i = markdown.indexOf('\n', i + 1)) {
    breaks += 1;
    if (breaks >= maxLines) {
      return false;
    }
  }
  return true;
}

/** A blank line (or the end of the document) follows `pos` — the block ending there was not cut short. */
function endsAtBlockBoundary(markdown: string, pos: number): boolean {
  return /^[ \t]*\r?\n[ \t]*(\r?\n|$)|^[ \t]*$/.test(markdown.slice(pos, pos + 32));
}

/**
 * Bounded block extraction for the Card preview: only the part of a note
 * that can contribute to the visible card is parsed and handed to the
 * renderer — the rest is never parsed, never turned into React elements,
 * and never relies on `overflow: hidden` to hide it.
 *
 * Why the *source* is bounded before parsing, not the parse with Lezer's
 * `stopAt`: measured against the installed `@lezer/markdown`, `stopAt`
 * does stop a many-block document early (a ~930KB note: ~0.5ms vs ~170ms
 * for a full parse), but it cannot cut *inside* a single block — a 1MB
 * paragraph or a 500-line fenced code block is parsed whole regardless.
 * Cutting the input at a line boundary first bounds both cases, and
 * parsing a prefix is still the existing `sharedMarkdownParser`, so the
 * grammar can't drift from the editor's.
 *
 * Boundary handling: the cut is at a line break. A block that ends before
 * the cut with a blank line (or end of document) after it is complete and
 * kept as-is. A block the cut lands inside is incomplete: it is dropped
 * when enough content is already kept (`minFillChars`) so the preview ends
 * on a whole block, and otherwise kept shortened — an unterminated fence,
 * a table or list with fewer rows, or a shorter paragraph are all
 * well-formed single blocks to Lezer, never a malformed structure.
 */
export function extractPreviewBlocks(
  markdown: string,
  limits: PreviewLimits = DEFAULT_PREVIEW_LIMITS
): PreviewExtraction {
  const length = boundedLength(markdown, limits);
  const cut = length < markdown.length;
  const text = cut ? markdown.slice(0, length) : markdown;

  const tree = sharedMarkdownParser.parse(text);
  const blocks: SyntaxNode[] = [];
  for (let child = tree.topNode.firstChild; child; child = child.nextSibling) {
    blocks.push(child);
  }

  const last = blocks[blocks.length - 1];
  if (cut && last && blocks.length > 1 && last.from >= limits.minFillChars && !endsAtBlockBoundary(markdown, last.to)) {
    blocks.pop();
  }

  const overBlockLimit = blocks.length > limits.maxBlocks;
  return {
    text,
    blocks: overBlockLimit ? blocks.slice(0, limits.maxBlocks) : blocks,
    truncated: cut || overBlockLimit,
  };
}
