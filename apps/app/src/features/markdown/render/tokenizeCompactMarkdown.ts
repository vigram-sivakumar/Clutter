import type { SyntaxNode } from '@lezer/common';
import { parser as baseMarkdownParser } from '@lezer/markdown';

import { scanDate } from '../editor/codemirror/date/dateScanner';
import { markdownGrammarExtensions } from '../editor/codemirror/markdownGrammarExtensions';
import { scanTag } from '../editor/codemirror/tag/tagScanner';
import { scanWikiLink } from '../editor/codemirror/wikilink/wikiLinkScanner';

export type CompactSpan =
  | { readonly kind: 'text'; readonly value: string }
  | { readonly kind: 'bold' | 'italic' | 'strikethrough' | 'code'; readonly value: string }
  | { readonly kind: 'wikilink'; readonly path: string; readonly alias: string | null }
  | { readonly kind: 'tag'; readonly name: string }
  | { readonly kind: 'date'; readonly isoDate: string };

/**
 * Parses with the exact same `@lezer/markdown` grammar the page editor
 * uses (`markdownGrammarExtensions`), completely independent of
 * CodeMirror — no `EditorView`/`EditorState` involved, just
 * `MarkdownParser.parse(text)`. This is what guarantees the sidebar's
 * compact rendering can never silently disagree with the page's about
 * what counts as bold/italic/strikethrough/code/WikiLink/Tag/Date.
 */
const compactMarkdownParser = baseMarkdownParser.configure(markdownGrammarExtensions);

/**
 * Emphasis-family node kinds that flatten to a single span: each always
 * parses with exactly two same-named mark children bracketing its content
 * (confirmed against the installed `@lezer/markdown` by
 * `emphasisMarkerDecoration.ts`/`strikethroughMarkerDecoration.ts`/
 * `inlineCodeMarkerDecoration.ts`, whose doc comments this reuses rather
 * than re-deriving). A nested construct between the marks (`***bold
 * italic***`, `**[[Note]]**`) is deliberately not recursed into — it
 * stays as literal raw text inside the outer span's `value`, one flat
 * style per span, matching the smallest-scope compact-rendering plan.
 */
const EMPHASIS_NODES: Readonly<Record<string, { kind: 'bold' | 'italic' | 'strikethrough' | 'code'; markName: string }>> = {
  Emphasis: { kind: 'italic', markName: 'EmphasisMark' },
  StrongEmphasis: { kind: 'bold', markName: 'EmphasisMark' },
  Strikethrough: { kind: 'strikethrough', markName: 'StrikethroughMark' },
  InlineCode: { kind: 'code', markName: 'CodeMark' },
};

function markedInnerText(node: SyntaxNode, text: string, markName: string): string {
  const open = node.firstChild;
  const close = node.lastChild;
  if (!open || open.name !== markName || !close || close.name !== markName || open === close) {
    // Not the guaranteed two-mark shape the doc comment above documents —
    // defensively fall back to the node's full raw text rather than
    // mis-slicing marks into the value.
    return text.slice(node.from, node.to);
  }
  return text.slice(open.to, close.from);
}

/**
 * `WikiLink`/`Tag`/`Date` nodes are each registered as a single flat
 * element with no children (`cx.elt(name, pos, pos + match.end)` — see
 * `wikiLinkSyntax.ts`/`tagSyntax.ts`/`dateSyntax.ts`), so their structured
 * fields (path/alias, name, isoDate) aren't recoverable from the tree
 * shape at all — re-running each construct's own pure scanner at the
 * node's start offset is how the Lezer glue itself produces these nodes
 * in the first place, so it's the correct, already-proven way to recover
 * the same fields here, not a parallel re-implementation.
 */
function readWikiLink(node: SyntaxNode, text: string): CompactSpan {
  const match = scanWikiLink(text, node.from);
  if (!match) {
    return { kind: 'text', value: text.slice(node.from, node.to) };
  }
  return { kind: 'wikilink', path: match.path, alias: match.alias };
}

function readTag(node: SyntaxNode, text: string): CompactSpan {
  const match = scanTag(text, node.from);
  if (!match) {
    return { kind: 'text', value: text.slice(node.from, node.to) };
  }
  return { kind: 'tag', name: match.name };
}

function readDate(node: SyntaxNode, text: string): CompactSpan {
  const match = scanDate(text, node.from);
  if (!match) {
    return { kind: 'text', value: text.slice(node.from, node.to) };
  }
  return { kind: 'date', isoDate: match.isoDate };
}

/**
 * Tokenizes `text` into a flat, marker-free sequence of `CompactSpan`s for
 * compact (sidebar-row) display — pure, React- and CodeMirror-independent.
 *
 * Walks the parse tree depth-first with a single running cursor: any node
 * of a recognized kind (emphasis family, WikiLink, Tag, Date) is emitted
 * as its own span and not recursed into; everything else (Document,
 * Paragraph, and any other block/inline node this grammar produces) is
 * recursed through so its recognized descendants are still found,
 * wherever they're nested. Text between/around recognized nodes — plain
 * words, unrecognized syntax (e.g. a leading heading marker, since block-
 * marker stripping is a separate, upstream concern — see
 * `getDailyNotePrimaryDisplayText.ts`) — is captured verbatim as `'text'` spans.
 */
export function tokenizeCompactMarkdown(text: string): CompactSpan[] {
  const tree = compactMarkdownParser.parse(text);
  const spans: CompactSpan[] = [];
  let cursor = 0;

  function pushText(from: number, to: number): void {
    if (to > from) {
      spans.push({ kind: 'text', value: text.slice(from, to) });
    }
  }

  function visit(node: SyntaxNode): void {
    const emphasis = EMPHASIS_NODES[node.name];
    if (emphasis) {
      pushText(cursor, node.from);
      spans.push({ kind: emphasis.kind, value: markedInnerText(node, text, emphasis.markName) });
      cursor = node.to;
      return;
    }

    if (node.name === 'WikiLink' || node.name === 'Tag' || node.name === 'Date') {
      pushText(cursor, node.from);
      spans.push(
        node.name === 'WikiLink' ? readWikiLink(node, text) : node.name === 'Tag' ? readTag(node, text) : readDate(node, text)
      );
      cursor = node.to;
      return;
    }

    for (let child = node.firstChild; child; child = child.nextSibling) {
      visit(child);
    }
  }

  visit(tree.topNode);
  pushText(cursor, text.length);

  return spans;
}
