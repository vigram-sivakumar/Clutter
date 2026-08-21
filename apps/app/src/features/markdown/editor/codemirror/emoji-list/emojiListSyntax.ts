import { tags } from '@lezer/highlight';
import type { BlockContext, Line, MarkdownExtension } from '@lezer/markdown';

/**
 * Matches one leading emoji grapheme cluster: a base
 * `Extended_Pictographic` code point, optionally followed by a variation
 * selector (U+FE0F) or skin-tone modifier, optionally extended via
 * ZWJ (U+200D) into a longer sequence (family/profession emoji). This is
 * a single regex evaluated once by the block parser below — not
 * decoration-layer scanning; the decoration/keymap layers only ever read
 * the resulting `EmojiListMark` node's range.
 */
const EMOJI_MARKER_PATTERN = new RegExp(
  '^\\p{Extended_Pictographic}(?:\\uFE0F|\\p{Emoji_Modifier})?' +
    '(?:\\u200D\\p{Extended_Pictographic}(?:\\uFE0F|\\p{Emoji_Modifier})?)*',
  'u'
);

function isSpace(code: number): boolean {
  return code === 32 || code === 9 || code === 10 || code === 13;
}

/**
 * Returns the marker's UTF-16 length if `line` starts (after any base
 * indent already stripped by enclosing contexts) with an emoji list
 * marker, or -1 otherwise. Any recognized emoji is a valid marker —
 * matching CommonMark's own treatment of `-`/`*`/`+`, which never tries to
 * distinguish "looks like a list" from "looks like prose" either.
 */
export function isEmojiListMarker(line: Line): number {
  const rest = line.text.slice(line.pos);
  const match = EMOJI_MARKER_PATTERN.exec(rest);
  if (!match || match[0].length === 0) {
    return -1;
  }
  const size = match[0].length;
  return size === rest.length || isSpace(rest.charCodeAt(size)) ? size : -1;
}

/**
 * Reimplements @lezer/markdown's internal (unexported) `getListIndent`, so
 * an emoji list item's nested content aligns exactly the way it does for
 * native bullet/ordered lists. Not available through the package's public
 * API (confirmed against `node_modules/@lezer/markdown/dist/index.d.ts`),
 * hence the small local copy rather than an import.
 */
function getListIndent(line: Line, pos: number): number {
  const indentAfter = line.countIndent(pos, line.pos, line.indent);
  const skipped = line.skipSpace(pos);
  const indented = line.countIndent(skipped, pos, indentAfter);
  return indented >= indentAfter + 5 || skipped === line.text.length ? indentAfter + 1 : indented;
}

function emojiListBlock(cx: BlockContext, line: Line): boolean | null {
  const size = isEmojiListMarker(line);
  if (size < 0) {
    return false;
  }
  if (cx.parentType().name !== 'EmojiList') {
    cx.startComposite('EmojiList', line.basePos);
  }
  const newBase = getListIndent(line, line.pos + size);
  cx.startComposite('ListItem', line.basePos, newBase - line.baseIndent);
  cx.addElement(cx.elt('EmojiListMark', cx.lineStart + line.pos, cx.lineStart + line.pos + size));
  line.moveBaseColumn(newBase);
  return null;
}

/**
 * Continuation rule for the `EmojiList` container. Unlike `BulletList`/
 * `OrderedList` (which require the exact same marker character to
 * repeat), any recognized emoji marker continues the same list — the
 * point of this construct is that `🍎`/`🍊`/`🍌` form one list, not three.
 *
 * This only decides whether the *container* is still active for a given
 * line; per-item continuation (how far a wrapped/nested line must be
 * indented to belong to a specific item) is left entirely to `ListItem`'s
 * own generic, unmodified indent-based skip handler — the same one every
 * other list type already shares. `@lezer/markdown`'s own `BulletList`
 * additionally special-cases a line that's indented enough to belong to
 * an already-open nested item but doesn't itself carry a fresh marker,
 * using its internal (unexported) per-item indent value; that value isn't
 * reachable through the public `MarkdownConfig` API, so this uses the
 * coarser `line.indent > line.baseIndent` proxy instead. In practice this
 * only under-serves one narrow edge case — continuation text indented by
 * less than a full item's marker width but still indented at all — where
 * the real per-item check above would normally decide; ordinary
 * paragraphs, nested lists, and blank lines inside an item all behave
 * correctly.
 */
function emojiListComposite(_cx: BlockContext, line: Line): boolean {
  if (line.pos === line.text.length) {
    return true;
  }
  if (isEmojiListMarker(line) >= 0) {
    return true;
  }
  return line.indent > line.baseIndent;
}

/**
 * `@lezer/markdown` doesn't drive paragraph-interruption from the
 * `MarkdownConfig`/`parseBlock` mechanism alone — `isBulletList`/
 * `isOrderedList` are wired in as default `endLeafBlock` stops separately
 * from (and invisibly to) the public extension surface (confirmed
 * directly against the installed package: `node_modules/@lezer/markdown/
 * dist/index.js`, the `DefaultEndLeaf` array). Without an equivalent
 * `endLeaf` here, a line starting with an emoji marker would silently
 * become part of an already-open paragraph instead of starting a new
 * list item — exactly the "- Fruits" vs. "🍎 Apple" starting a fresh item
 * behavior every other list marker already gets for free.
 */
function endsLeafForEmojiList(_cx: BlockContext, line: Line): boolean {
  return isEmojiListMarker(line) >= 0;
}

export const emojiListSyntax: MarkdownExtension = {
  defineNodes: [
    { name: 'EmojiList', block: true, composite: emojiListComposite, style: tags.list },
    { name: 'EmojiListMark', style: tags.atom },
  ],
  parseBlock: [
    {
      name: 'EmojiList',
      parse: emojiListBlock,
      endLeaf: endsLeafForEmojiList,
      after: 'OrderedList',
    },
  ],
};
