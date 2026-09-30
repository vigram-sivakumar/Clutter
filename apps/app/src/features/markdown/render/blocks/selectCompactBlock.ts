import type { SyntaxNode } from '@lezer/common';

import { matchStraightLabeledDivider, matchWrappedDivider } from '../../editor/codemirror/hr/dividerLabelMatch';
import { parseTableColumnWidthsAttribute } from '../../editor/codemirror/table/tableColumnWidthMetadata';
import { sharedMarkdownParser } from '../sharedMarkdownParser';
import { tokenizeInline, type InlineSpan } from '../inlineSpan';

/**
 * The block-selection half of the compact-rendering policy — "which block
 * of the document, if any, becomes the compact representation." Reads the
 * exact same `sharedMarkdownParser` tree every other CM6-independent
 * rendering surface parses with (never a second, regex-based Markdown
 * awareness — see this module's own callers for why that mattered:
 * `getDailyNotePrimaryDisplayText.ts` used to hand-roll a four-pattern
 * leading-marker regex per line instead of walking real block structure).
 *
 * Kept as its own module, separate from `inlineSpan.ts`'s `tokenizeInline`,
 * per the architecture this was built against: block semantics (which
 * block wins) and inline semantics (how a block's own content tokenizes)
 * are two different concerns, and `tokenizeInline` should not grow
 * block-selection responsibilities of its own — it only needs to already
 * skip structural marker nodes wherever they occur (which it does), so
 * that handing it a single selected block node "just works."
 *
 * A one-line summary of the policy, in document order, at the top level
 * only (no descending into a container to look for meaningful content
 * elsewhere once a container itself is judged non-meaningful — matching
 * the approved "first meaningful block wins, never concatenate" contract):
 * - `Paragraph`, any ATX/Setext heading, `Blockquote` — meaningful if any
 *   non-marker content remains after stripping `HeaderMark`/`QuoteMark`.
 * - `BulletList`/`OrderedList`/`EmojiList` — meaningful if any one of its
 *   `ListItem` children has non-marker content (`ListMark`/`TaskMarker`
 *   stripped); the first such item wins, not the whole list.
 * - `WavyHorizontalRule`/`DoubleHorizontalRule`/`DottedHorizontalRule`/
 *   `LabeledHorizontalRule` — meaningful only when the occurrence actually
 *   carries a label (any of the four can be bare *or* labeled — reusing
 *   `dividerLabelMatch.ts`'s own matchers rather than re-deriving the
 *   label shape, since `horizontalRuleDecoration.ts` already establishes
 *   this exact "any variant can carry a label" precedent for at-rest
 *   rendering). A bare divider of any kind, and the native, always-bare
 *   `HorizontalRule`, are structural — skipped.
 * - `FencedCode`, `Table`, and anything else unrecognized at the top
 *   level are structural/unsupported for this policy's v1 scope —
 *   skipped, never partially exposed (no first-cell, no first-code-line,
 *   no fence/language leak). A `Table`'s own `{table-col-widths="..."}`
 *   attribute line (see `tableColumnWidthMetadata.ts`) is skipped right
 *   along with it, whether the attribute line stands alone or is merged
 *   (no blank line) with real content that follows it.
 *
 * `EmojiListMark` is deliberately never treated as a marker to strip —
 * see `inlineSpan.ts`'s own doc comment: the chosen emoji is real,
 * user-authored content (why else would some list items be 🍎 and others
 * 🍊), unlike a plain `-`/`*` bullet, which carries no information at all.
 */

const HEADING_NODE_NAMES: ReadonlySet<string> = new Set([
  'ATXHeading1',
  'ATXHeading2',
  'ATXHeading3',
  'ATXHeading4',
  'ATXHeading5',
  'ATXHeading6',
  'SetextHeading1',
  'SetextHeading2',
]);

const LEAF_BLOCK_NODE_NAMES: ReadonlySet<string> = new Set(['Paragraph', 'Blockquote', ...HEADING_NODE_NAMES]);

const LIST_LIKE_NODE_NAMES: ReadonlySet<string> = new Set(['BulletList', 'OrderedList', 'EmojiList']);

/** The wrap character each Clutter divider variant that can carry a label uses — see `dividerLabelMatch.ts`. */
const WRAPPED_DIVIDER_CHAR: Readonly<Record<string, string>> = {
  WavyHorizontalRule: '~',
  DoubleHorizontalRule: '=',
  DottedHorizontalRule: '.',
};

/**
 * Pure structural markers — a heading's `#` run, a blockquote's `>`, a
 * list item's `-`/`*`/`+`/`1.`, a task item's `[ ]`/`[x]` — stripped from
 * `node`'s own raw source text wherever they occur among its descendants
 * (a multi-line blockquote's *each* line's own `QuoteMark` is removed, not
 * just the first). Mirrors `tokenizeInline`'s own marker-skip set exactly
 * (kept in sync deliberately, not re-derived) but produces a plain string
 * rather than typed spans — this is the "how much of this block is real
 * content, once markers are gone" question a plain boolean/string answer
 * suffices for, without needing inline-construct resolution (WikiLink/Tag/
 * Date/emphasis are deliberately left as their own raw Markdown source
 * here, untouched — this function only ever removes marker nodes, never
 * resolves anything — so a caller that re-tokenizes the result through the
 * real inline pipeline still sees genuine, unmangled Markdown syntax).
 */
const STRUCTURAL_MARKER_NODE_NAMES: ReadonlySet<string> = new Set([
  'HeaderMark',
  'QuoteMark',
  'ListMark',
  'TaskMarker',
  'TaskCompletionMetadata',
]);

function stripStructuralMarkers(node: SyntaxNode, text: string, from?: number): string {
  let result = '';
  let cursor = from ?? node.from;

  function visit(n: SyntaxNode): void {
    if (STRUCTURAL_MARKER_NODE_NAMES.has(n.name)) {
      result += text.slice(cursor, n.from);
      cursor = n.to;
      return;
    }
    for (let child = n.firstChild; child; child = child.nextSibling) {
      visit(child);
    }
  }

  visit(node);
  result += text.slice(cursor, node.to);
  return result;
}

function isMeaningfulLeafBlock(node: SyntaxNode, text: string): boolean {
  return stripStructuralMarkers(node, text).trim().length > 0;
}

/**
 * The label text of a divider occurrence, or `null` when this particular
 * occurrence is bare (structural, no authored content) — reuses
 * `dividerLabelMatch.ts`'s own matchers (the same ones the block parsers
 * and `horizontalRuleDecoration.ts` already use) rather than re-deriving
 * the wrapped/straight label shape. The native, always-bare `HorizontalRule`
 * has no case here at all — it is never labeled, by construction (see
 * `labeledHorizontalRuleSyntax.ts`'s own doc comment), so it is handled by
 * `findMeaningfulTopLevelBlock`'s default "skip" branch instead.
 */
function dividerLabelText(node: SyntaxNode, text: string): string | null {
  const raw = text.slice(node.from, node.to);
  const wrapChar = WRAPPED_DIVIDER_CHAR[node.name];
  if (wrapChar) {
    return matchWrappedDivider(raw, wrapChar)?.label ?? null;
  }
  if (node.name === 'LabeledHorizontalRule') {
    return matchStraightLabeledDivider(raw);
  }
  return null;
}

/** A selected block, ready for either span- or plain-text extraction. */
export interface CompactBlockSelection {
  readonly node: SyntaxNode;
  /** Non-null only for a divider-with-label match — its node has no inline content to tokenize, only this precomputed label. */
  readonly dividerLabel: string | null;
  /**
   * Where `node`'s own meaningful content starts, in `text`'s coordinates —
   * `node.from` for every ordinary selection. Only ever different for a
   * table's `{table-col-widths="..."}` attribute line glued (no blank line
   * between them) to real content that follows it on the same `Paragraph`
   * node: `node` is that merged paragraph, and `contentFrom` points past the
   * attribute line's own text so only the real content after it is
   * extracted. See `findMeaningfulTopLevelBlock`'s `Table` case.
   */
  readonly contentFrom: number;
}

function firstMeaningfulListItem(list: SyntaxNode, text: string): SyntaxNode | null {
  for (let item = list.firstChild; item; item = item.nextSibling) {
    if (item.name === 'ListItem' && isMeaningfulLeafBlock(item, text)) {
      return item;
    }
  }
  return null;
}

/**
 * Walks `topNode`'s direct (top-level) children in document order and
 * returns the first one this policy considers meaningful — never
 * concatenating across blocks, and never descending into a structural
 * block (a table, a fenced code block) looking for something salvageable
 * inside it. `null` when no top-level block yields anything — the
 * caller's own entry-identity fallback territory, not this function's.
 */
function findMeaningfulTopLevelBlock(topNode: SyntaxNode, text: string): CompactBlockSelection | null {
  for (let node = topNode.firstChild; node; node = node.nextSibling) {
    if (LEAF_BLOCK_NODE_NAMES.has(node.name)) {
      if (isMeaningfulLeafBlock(node, text)) {
        return { node, dividerLabel: null, contentFrom: node.from };
      }
      continue;
    }

    if (LIST_LIKE_NODE_NAMES.has(node.name)) {
      const item = firstMeaningfulListItem(node, text);
      if (item) {
        return { node: item, dividerLabel: null, contentFrom: item.from };
      }
      continue;
    }

    if (node.name in WRAPPED_DIVIDER_CHAR || node.name === 'LabeledHorizontalRule') {
      const label = dividerLabelText(node, text);
      if (label !== null) {
        return { node, dividerLabel: label, contentFrom: node.from };
      }
      continue;
    }

    if (node.name === 'Table') {
      const next = node.nextSibling;
      if (next) {
        const nextText = text.slice(next.from, next.to);
        const newlineIndex = nextText.indexOf('\n');
        const firstLine = newlineIndex === -1 ? nextText : nextText.slice(0, newlineIndex);
        if (parseTableColumnWidthsAttribute(firstLine) !== null) {
          // The table's own column-width metadata line — persisted as a
          // plain sibling paragraph immediately after the table by design
          // (see `tableColumnWidthMetadata.ts`'s own doc comment), never a
          // distinct grammar node.
          if (newlineIndex === -1) {
            // The attribute line is the sibling's entire text (isolated by
            // a blank line, or the document's last line) — skip it along
            // with the table it belongs to, rather than exposing it as if
            // it were the next real block.
            node = next;
            continue;
          }
          // No blank line separates the attribute line from real content
          // that follows it — GFM's own paragraph-continuation rule merges
          // both into this single `Paragraph` node. Skip only the attribute
          // line's own text; the remainder, if any, is this block's content.
          const contentFrom = next.from + newlineIndex + 1;
          if (text.slice(contentFrom, next.to).trim().length > 0) {
            return { node: next, dividerLabel: null, contentFrom };
          }
          node = next;
          continue;
        }
      }
      continue;
    }

    // FencedCode, the native (always-bare) HorizontalRule, and any other
    // unrecognized top-level construct: structural/unsupported for this
    // policy — skip and keep looking, never partially exposed.
  }
  return null;
}

/** Parses `text` and selects its first meaningful top-level block, or `null` if none exists. */
export function selectCompactBlock(text: string): CompactBlockSelection | null {
  const tree = sharedMarkdownParser.parse(text);
  return findMeaningfulTopLevelBlock(tree.topNode, text);
}

/**
 * Trims leading/trailing whitespace left over from a removed structural
 * marker (a heading's `#`, a list item's `-`/`[ ]`, ...) — `tokenizeInline`
 * only removes the marker's own characters, never the separating space
 * that follows it, so a selected block's first/last span otherwise carries
 * that space verbatim (` Architecture` instead of `Architecture`). Only
 * the outer edges are trimmed, never interior whitespace, so multi-word
 * content is untouched.
 */
function trimEdgeWhitespace(spans: readonly InlineSpan[]): InlineSpan[] {
  if (spans.length === 0) {
    return [];
  }
  const result = spans.slice();

  const first = result[0]!;
  if (first.kind === 'text') {
    const trimmed = first.value.replace(/^\s+/, '');
    if (trimmed.length === 0) {
      result.shift();
    } else {
      result[0] = { kind: 'text', value: trimmed };
    }
  }

  const lastIndex = result.length - 1;
  const last = lastIndex >= 0 ? result[lastIndex] : undefined;
  if (last && last.kind === 'text') {
    const trimmed = last.value.replace(/\s+$/, '');
    if (trimmed.length === 0) {
      result.pop();
    } else {
      result[lastIndex] = { kind: 'text', value: trimmed };
    }
  }

  return result;
}

/** The selected block's inline content, tokenized through the real inline pipeline — used by `tokenizeCompactMarkdown`. */
export function compactBlockSpans(selection: CompactBlockSelection, text: string): InlineSpan[] {
  if (selection.dividerLabel !== null) {
    return [{ kind: 'text', value: selection.dividerLabel }];
  }
  return trimEdgeWhitespace(tokenizeInline(selection.node, text, selection.contentFrom));
}

/**
 * The selected block's content as a plain string, markers stripped but
 * any inline Markdown left as raw source (bold/WikiLink/Tag/Date/etc. are
 * not resolved here — see `stripStructuralMarkers`'s own doc comment) —
 * used by `getDailyNotePrimaryDisplayText`, whose own contract is a plain
 * string that a second, full compact-render pass tokenizes for inline
 * formatting. Truncated to its own first line only, matching this
 * function's one existing caller's long-standing "first line, not the
 * whole paragraph" behavior for a genuinely multi-line paragraph (never
 * exercised by a single-line block, which is simply returned whole).
 */
export function compactBlockText(selection: CompactBlockSelection, text: string): string {
  const full = selection.dividerLabel ?? stripStructuralMarkers(selection.node, text, selection.contentFrom).trim();
  return full.split('\n')[0]!.trim();
}
