import type { SyntaxNode } from '@lezer/common';

import { VaultPath } from '@core/vault/ingest/VaultPath';

import { scanDate } from '../../../core/vault/ingest/grammar/dateScanner';
import { scanEmbed } from '../../../core/vault/ingest/grammar/embedScanner';
import { scanImage } from '../editor/codemirror/image/imageScanner';
import { scanTag } from '@core/vault/ingest/tag/tagScanner';
import { scanWikiLink } from '../../../core/vault/ingest/grammar/wikiLinkScanner';

/**
 * Inline span vocabulary for a read-only Markdown rendering surface —
 * currently only the compact/sidebar renderer (`tokenizeCompactMarkdown`/
 * `renderCompactMarkdown`) — kept as its own module (rather than inlined
 * into that renderer) so a second CM6-independent rendering surface,
 * should one ever exist, shares this exact vocabulary instead of
 * independently deciding what counts as bold/italic/strikethrough/code/
 * highlight/WikiLink/Tag/Date/link/image.
 *
 * The four "styled container" kinds (`bold`/`italic`/`strikethrough`/
 * `highlight`) carry `children: InlineSpan[]` rather than a flat `value`
 * string — each composes with whatever semantic spans its own Markdown
 * children produce (a nested `Link`, `WikiLink`, `InlineCode`, or another
 * styled container), rather than flattening nested syntax to raw text.
 * `code` (`InlineCode`) stays a plain leaf with a `value` string: per
 * CommonMark, a code span's own content is never further parsed — no
 * nested Link/WikiLink/emphasis can ever appear inside one, so there is
 * nothing to recurse into by construction, unlike the other four.
 */
export interface StyledSpan {
  readonly kind: 'bold' | 'italic' | 'strikethrough' | 'highlight';
  readonly children: readonly InlineSpan[];
}

export type InlineSpan =
  | { readonly kind: 'text'; readonly value: string }
  | StyledSpan
  | { readonly kind: 'code'; readonly value: string }
  | { readonly kind: 'wikilink'; readonly path: string; readonly alias: string | null }
  | { readonly kind: 'tag'; readonly name: string }
  | { readonly kind: 'date'; readonly isoDate: string }
  | { readonly kind: 'link'; readonly label: string }
  /**
   * `src` is the Image's own raw destination (as written, never resolved) — present only when the
   * caller opted in via `TokenizeInlineOptions.includeImageSrc` (the Card view's block renderer, the
   * one surface with real image display); the compact tokenizer never sets it, so its span shape is
   * unchanged.
   */
  | { readonly kind: 'image'; readonly alt: string; readonly src?: string }
  | { readonly kind: 'embed'; readonly path: string; readonly alias: string | null };

export interface TokenizeInlineOptions {
  /** Also record each Image's raw destination as `src` — see `InlineSpan`'s image variant. */
  readonly includeImageSrc?: boolean;
}

/**
 * The four styled-container node kinds — each always parses with exactly
 * two same-named mark children bracketing its content (confirmed against
 * the installed `@lezer/markdown` by `emphasisMarkerDecoration.ts`/
 * `strikethroughMarkerDecoration.ts`, whose doc comments this reuses
 * rather than re-deriving). `InlineCode` is deliberately not in this map —
 * see `StyledSpan`'s own doc comment for why it stays a leaf, handled
 * separately in `tokenizeChildren` below.
 */
export const STYLED_CONTAINER_NODES: Readonly<Record<string, { kind: StyledSpan['kind']; markName: string }>> = {
  Emphasis: { kind: 'italic', markName: 'EmphasisMark' },
  StrongEmphasis: { kind: 'bold', markName: 'EmphasisMark' },
  Strikethrough: { kind: 'strikethrough', markName: 'StrikethroughMark' },
  Highlight: { kind: 'highlight', markName: 'HighlightMark' },
};

export function markedInnerText(node: SyntaxNode, text: string, markName: string): string {
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
export function readWikiLink(node: SyntaxNode, text: string): InlineSpan {
  const match = scanWikiLink(text, node.from);
  if (!match) {
    return { kind: 'text', value: text.slice(node.from, node.to) };
  }
  return { kind: 'wikilink', path: match.path, alias: match.alias };
}

export function readTag(node: SyntaxNode, text: string): InlineSpan {
  const match = scanTag(text, node.from);
  if (!match) {
    return { kind: 'text', value: text.slice(node.from, node.to) };
  }
  return { kind: 'tag', name: match.name };
}

export function readDate(node: SyntaxNode, text: string): InlineSpan {
  const match = scanDate(text, node.from);
  if (!match) {
    return { kind: 'text', value: text.slice(node.from, node.to) };
  }
  return { kind: 'date', isoDate: match.isoDate };
}

/**
 * `Link`/`Image` both parse as a flat run of `LinkMark` tokens around an
 * unnamed label range plus a `URL` child (confirmed empirically against
 * the installed `@lezer/markdown@1.7.2`: `[text](url)` → `LinkMark"["`,
 * `LinkMark"]"`, `LinkMark"("`, `URL`, `LinkMark")"`; `![alt](url)` is the
 * same shape with `LinkMark"!["` as the opening mark) — the label itself
 * has no node of its own, so it's recovered the same way `markedInnerText`
 * recovers emphasis content: the text between the first two `LinkMark`
 * children.
 */
export function bracketedLabelText(node: SyntaxNode, text: string): string | null {
  const marks: SyntaxNode[] = [];
  for (let child = node.firstChild; child && marks.length < 2; child = child.nextSibling) {
    if (child.name === 'LinkMark') {
      marks.push(child);
    }
  }
  const [open, close] = marks;
  if (!open || !close) {
    return null;
  }
  return text.slice(open.to, close.from);
}

/**
 * The `URL` child of a `Link`/`Image` node (see `bracketedLabelText`'s own
 * doc comment for the shared node shape) — `null` when the node has none
 * (e.g. an empty destination, `[label]()`), never re-derived by manual
 * `LinkMark` counting the way the bracketed label is, since `URL` already
 * exists as its own named child.
 */
function linkUrlText(node: SyntaxNode, text: string): string | null {
  const url = node.getChild('URL');
  return url ? text.slice(url.from, url.to) : null;
}

/**
 * Compact-rendering fallback policy for a Link with an empty label
 * (`[](url)`): the URL is still meaningfully addressable content — shown
 * as plain text, the same treatment Autolink/bare-URL already get —
 * rather than a blank span. `[label]()` (empty URL, real label) is
 * unaffected: `bracketedLabelText` already returns the non-empty label,
 * so this fallback is never reached for it. When both label and URL are
 * empty/absent there's nothing addressable at all — `null` tells the
 * caller to contribute nothing, never a raw `[]()`.
 */
export function readLink(node: SyntaxNode, text: string): InlineSpan | null {
  const label = bracketedLabelText(node, text);
  if (label === null) {
    return { kind: 'text', value: text.slice(node.from, node.to) };
  }
  if (label.trim().length > 0) {
    return { kind: 'link', label };
  }
  const url = linkUrlText(node, text);
  return url ? { kind: 'link', label: url } : null;
}

/**
 * Compact-rendering fallback policy for an Image with empty alt text
 * (`![](url)`): the URL's own basename, extension stripped — reusing
 * `VaultPath.stemName` (the one general path-string utility already
 * trusted for WikiLink/Embed target-basename fallbacks, per
 * `ARCHITECTURE_RULES.md` rule 9 — never a second path parser) — rather
 * than the raw URL or a generic "Image" placeholder, since a filename is
 * still real, recognizable information the user can act on. `null` (no
 * usable alt or basename) tells the caller to contribute nothing.
 *
 * Alt text is read through `scanImage` (`imageScanner.ts`) rather than
 * `bracketedLabelText`'s raw bracket slice — the same pure scanner the real
 * editor's own live preview already parses an Image node's raw text with —
 * so an Obsidian-style `|width,height,alignment,mode` presentation suffix
 * (`mediaPresentationModel.ts`) is already split off before `alt` is ever
 * read here, never exposed as sidebar text. `scanImage` splits on the
 * *first* `|` unconditionally, with no recognized-token check, so
 * `![A | B](url)` yields alt `"A"` here too — a pre-existing, documented
 * tradeoff of this syntax (see `imageScanner.ts`'s own doc comment),
 * already true of the real editor's rendering; this function does not
 * introduce it, only stops diverging from it.
 */
export function readImage(node: SyntaxNode, text: string, includeSrc = false): InlineSpan | null {
  const match = scanImage(text.slice(node.from, node.to));
  if (!match) {
    return { kind: 'text', value: text.slice(node.from, node.to) };
  }
  if (match.alt.trim().length > 0) {
    return includeSrc ? { kind: 'image', alt: match.alt, src: match.url } : { kind: 'image', alt: match.alt };
  }
  const basename = VaultPath.stemName(match.url);
  if (!basename) {
    return null;
  }
  return includeSrc ? { kind: 'image', alt: basename, src: match.url } : { kind: 'image', alt: basename };
}

/**
 * `Embed` is a single flat element with no children — same shape as
 * `WikiLink` (it delegates entirely to `scanWikiLink` underneath, offset
 * by the leading `!`; see `embedScanner.ts`'s own doc comment). Re-running
 * `scanEmbed` at the node's start offset is the same "recover structured
 * fields via the construct's own pure scanner" pattern `readWikiLink`
 * already establishes.
 */
export function readEmbed(node: SyntaxNode, text: string): InlineSpan {
  const match = scanEmbed(text, node.from);
  if (!match) {
    return { kind: 'text', value: text.slice(node.from, node.to) };
  }
  return { kind: 'embed', path: match.path, alias: match.alias };
}

/**
 * Pure structural markup with no content of its own — a heading's `#`
 * run, a blockquote's `>`, a list item's `-`/`*`/`+`/`1.`, a task item's
 * `[ ]`/`[x]`, a task's `@completed:...` annotation (already concealed in
 * the real editor, per `taskCompletionMetadataSyntax.ts`'s own doc
 * comment), and — since nested-inline composition — the four styled
 * containers' own opening/closing marks (`**`/`*`/`~~`/`==`). Consumed
 * with no span of their own wherever they occur in a walked node's
 * descendants, at any nesting depth: this is what lets `tokenizeChildren`
 * below recurse into a `StrongEmphasis`'s own children and have its
 * `EmphasisMark` pair disappear the same way a top-level `HeaderMark`
 * already does, with no separate per-container marker-stripping step.
 * `EmojiListMark` is deliberately excluded — it is real, user-chosen
 * content (see `selectCompactBlock.ts`'s own doc comment) — and
 * `CodeMark` is excluded too, since `InlineCode` is intercepted as a leaf
 * before generic recursion ever reaches its own mark children (see
 * `StyledSpan`'s own doc comment).
 */
const STRUCTURAL_MARKER_NODE_NAMES: ReadonlySet<string> = new Set([
  'HeaderMark',
  'QuoteMark',
  'ListMark',
  'TaskMarker',
  'TaskCompletionMetadata',
  'EmphasisMark',
  'StrikethroughMark',
  'HighlightMark',
]);

/**
 * Walks `node`'s direct children (not `node` itself) into a marker-free,
 * semantically-typed sequence of `InlineSpan`s — the single recursive
 * engine both `tokenizeInline` (called once per selected block) and each
 * styled container's own recursive case below share, so a `Strikethrough`
 * or `StrongEmphasis` node's children are walked by the exact same logic
 * as a `Paragraph`'s, with no special-cased "strike+link"/"strong+
 * WikiLink"/etc. combinations anywhere.
 *
 * Any node of a recognized *semantic* kind (`WikiLink`, `Tag`, `Date`,
 * `Link`, `Image`, `Embed`, `Autolink`, bare `URL`, `InlineCode`) is
 * emitted as its own leaf span and not recursed into — these are the
 * constructs `StyledSpan`'s own doc comment lists as never losing their
 * type, regardless of how deeply nested inside styled containers they
 * are. Any node of a recognized *styled-container* kind (`Emphasis`/
 * `StrongEmphasis`/`Strikethrough`/`Highlight`) recurses into its own
 * children via this same function, producing a `StyledSpan` whose
 * `children` compose with whatever that recursive call finds — this is
 * what replaces the old "flatten to raw text" behavior: nesting composes
 * by nesting spans, not by string-concatenating markers into a value.
 * `STRUCTURAL_MARKER_NODE_NAMES` is consumed with no span at any depth.
 * Everything else unrecognized is recursed through generically so its own
 * recognized descendants are still found, wherever nested, captured as
 * `'text'` spans in the gaps between them.
 */
function tokenizeChildren(
  node: SyntaxNode,
  text: string,
  from?: number,
  options: TokenizeInlineOptions = {}
): InlineSpan[] {
  const spans: InlineSpan[] = [];
  let cursor = from ?? node.from;

  function pushText(from: number, to: number): void {
    if (to > from) {
      const value = text.slice(from, to);
      const last = spans[spans.length - 1];
      // Merge into an immediately-preceding text span rather than pushing
      // a second adjacent one — two marker-skips in a row (e.g. a task
      // item's `ListMark` then `TaskMarker`, each consuming their own
      // gap) would otherwise leave the whitespace between them as its own
      // orphan span instead of one contiguous run of text.
      if (last && last.kind === 'text') {
        spans[spans.length - 1] = { kind: 'text', value: last.value + value };
      } else {
        spans.push({ kind: 'text', value });
      }
    }
  }

  function visit(n: SyntaxNode): void {
    if (STRUCTURAL_MARKER_NODE_NAMES.has(n.name)) {
      pushText(cursor, n.from);
      cursor = n.to;
      return;
    }

    const container = STYLED_CONTAINER_NODES[n.name];
    if (container) {
      pushText(cursor, n.from);
      // Recurse into this container's own children — a nested Link,
      // WikiLink, InlineCode, or another styled container inside it is
      // found and typed by this same walk, not flattened to raw text.
      spans.push({ kind: container.kind, children: tokenizeChildren(n, text, undefined, options) });
      cursor = n.to;
      return;
    }

    if (n.name === 'InlineCode') {
      pushText(cursor, n.from);
      spans.push({ kind: 'code', value: markedInnerText(n, text, 'CodeMark') });
      cursor = n.to;
      return;
    }

    if (n.name === 'WikiLink' || n.name === 'Tag' || n.name === 'Date') {
      pushText(cursor, n.from);
      spans.push(n.name === 'WikiLink' ? readWikiLink(n, text) : n.name === 'Tag' ? readTag(n, text) : readDate(n, text));
      cursor = n.to;
      return;
    }

    if (n.name === 'Link' || n.name === 'Image') {
      pushText(cursor, n.from);
      const span = n.name === 'Link' ? readLink(n, text) : readImage(n, text, options.includeImageSrc);
      if (span) {
        spans.push(span);
      }
      cursor = n.to;
      return;
    }

    if (n.name === 'Embed') {
      pushText(cursor, n.from);
      spans.push(readEmbed(n, text));
      cursor = n.to;
      return;
    }

    if (n.name === 'Autolink') {
      pushText(cursor, n.from);
      spans.push({ kind: 'link', label: markedInnerText(n, text, 'LinkMark') });
      cursor = n.to;
      return;
    }

    if (n.name === 'URL') {
      pushText(cursor, n.from);
      spans.push({ kind: 'link', label: text.slice(n.from, n.to) });
      cursor = n.to;
      return;
    }

    for (let child = n.firstChild; child; child = child.nextSibling) {
      visit(child);
    }
  }

  for (let child = node.firstChild; child; child = child.nextSibling) {
    visit(child);
  }
  pushText(cursor, node.to);

  return spans;
}

/**
 * Flattens `node`'s inline content to a marker-free sequence of
 * `InlineSpan`s. Called both by `tokenizeCompactMarkdown`'s legacy
 * whole-document callers and, since the block-aware compact-rendering
 * policy (`selectCompactBlock.ts`), once per *selected* block node — a
 * `Paragraph`, a heading, a blockquote, a list item — never the whole
 * document at once for those callers, since block selection has already
 * decided which single block is being rendered.
 *
 * A thin entry point over `tokenizeChildren` (this module's own recursive
 * engine, shared with every styled container's own nested recursion) —
 * walks `node`'s children directly rather than dispatching on `node`
 * itself, since every real caller passes a block-level node
 * (`Paragraph`/heading/`Blockquote`/`ListItem`) that never itself matches
 * a styled-container or semantic-leaf case.
 *
 * `from` overrides where the first span's leading edge is measured from
 * (defaults to `node.from`) — a caller-controlled starting offset within
 * `node`, independent of the marker-consuming behavior `tokenizeChildren`
 * already applies at every depth.
 */
export function tokenizeInline(
  node: SyntaxNode,
  text: string,
  from?: number,
  options?: TokenizeInlineOptions
): InlineSpan[] {
  return tokenizeChildren(node, text, from, options);
}
