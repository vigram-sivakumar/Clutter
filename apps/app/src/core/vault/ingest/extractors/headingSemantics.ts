import type { SyntaxNode } from '@lezer/common';
import { parser as bareMarkdownParser } from '@lezer/markdown';

/**
 * ADR-032: the one shared implementation of heading extraction and
 * matching semantics, consumed by both the durable ingest path
 * (`HeadingExtractor` → `Page.analysis.headings` → `PageIndex`) and,
 * from UI/Features, a future live-render path (against
 * `EffectivePageState`'s markdown) — never independently reimplemented
 * by either. Deliberately uses the bare `@lezer/markdown` parser, not
 * the editor's `markdownGrammarExtensions` — heading detection needs
 * none of Clutter's custom grammar extensions, and importing the
 * editor's grammar config here would be an upward dependency from
 * Vault Ingest into UI/Features (ARCHITECTURE_RULES.md rule 7).
 */

const ATX_HEADING_NODE_NAMES = new Set([
  'ATXHeading1',
  'ATXHeading2',
  'ATXHeading3',
  'ATXHeading4',
  'ATXHeading5',
  'ATXHeading6',
]);

export interface HeadingOccurrence {
  readonly level: number;
  readonly text: string;
  readonly from: number;
}

/**
 * Only ATXHeading1-6 nodes that are direct children of Document count
 * as document headings — this deliberately excludes headings nested
 * inside a Blockquote/ListItem, and excludes anything inside a
 * FencedCode block (which never produces a heading node at all).
 */
export function extractHeadingOccurrences(
  markdown: string
): readonly HeadingOccurrence[] {
  const tree = bareMarkdownParser.parse(markdown);
  const occurrences: HeadingOccurrence[] = [];

  let node: SyntaxNode | null = tree.topNode.firstChild;

  while (node) {
    if (ATX_HEADING_NODE_NAMES.has(node.type.name)) {
      occurrences.push({
        level: Number(node.type.name.slice(-1)),
        text: extractPlainText(node, markdown).trim(),
        from: node.from,
      });
    }

    node = node.nextSibling;
  }

  return occurrences;
}

/**
 * Exact text match, first match in document order (`Array.prototype.find`
 * semantics) — extracted verbatim from `PageIndex.findHeading`'s existing
 * behavior so both the durable index and a live consumer share one rule.
 */
export function findFirstHeadingOccurrence<
  T extends { readonly text: string },
>(occurrences: readonly T[], text: string): T | undefined {
  return occurrences.find((occurrence) => occurrence.text === text);
}

/**
 * Flattens a node's inline content to plain text: mark nodes (HeaderMark,
 * EmphasisMark, CodeMark, etc. — anything named `*Mark`) contribute
 * nothing; every other span of source text — literal text between child
 * nodes, and the full span of a childless leaf node — is kept as-is.
 * Note: a leaf inline node with no Mark children of its own (e.g. WikiLink,
 * which parses as a single flat node) is not further stripped — its raw
 * bracket syntax is retained in the extracted text. This is a known,
 * accepted limitation, not a silent gap: heading titles containing
 * wikilinks/images/autolinks keep their raw `[[...]]`/`![...]`/`<...>`
 * syntax rather than resolving to a further-simplified label.
 */
function extractPlainText(node: SyntaxNode, source: string): string {
  let result = '';
  let pos = node.from;
  let child = node.firstChild;

  while (child) {
    if (child.from > pos) {
      result += source.slice(pos, child.from);
    }

    if (!child.type.name.endsWith('Mark')) {
      result += extractPlainText(child, source);
    }

    pos = child.to;
    child = child.nextSibling;
  }

  if (node.to > pos) {
    result += source.slice(pos, node.to);
  }

  return result;
}
