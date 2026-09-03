import { Autolink, Strikethrough, Table, TaskList, type MarkdownExtension } from '@lezer/markdown';

import { dateSyntax } from './date/dateSyntax';
import { embedSyntax } from './embed/embedSyntax';
import { emojiListSyntax } from './emoji-list/emojiListSyntax';
import { highlightSyntax } from './highlight/highlightSyntax';
import { doubleHorizontalRuleSyntax } from './hr/doubleHorizontalRuleSyntax';
import { dottedHorizontalRuleSyntax } from './hr/dottedHorizontalRuleSyntax';
import { labeledHorizontalRuleSyntax } from './hr/labeledHorizontalRuleSyntax';
import { wavyHorizontalRuleSyntax } from './hr/wavyHorizontalRuleSyntax';
import { listMarkerParagraphInterrupt } from './list/listMarkerParagraphInterrupt';
import { tagSyntax } from './tag/tagSyntax';
import { taskCompletionMetadataSyntax } from './task/taskCompletionMetadataSyntax';
import { wikiLinkSyntax } from './wikilink/wikiLinkSyntax';

/**
 * The exact `@lezer/markdown` grammar config the page editor parses with —
 * factored out so a second, CM6-independent consumer (the sidebar's
 * compact renderer) can parse the same GFM subset plus WikiLink/Tag/Date
 * with `parser.configure(markdownGrammarExtensions)` and get identical
 * semantics, with zero risk of the two surfaces drifting apart. See
 * `markdownLanguageExtension` below for the extension-by-extension
 * rationale (GFM subset scope, why WikiLink/Tag/Date are registered this
 * way, what's deliberately not enabled yet).
 *
 * `{ remove: ['IndentedCode'] }` (2026-08-28, editor-indentation-ceiling
 * milestone) disables CommonMark's "4+ leading columns = indented code
 * block" rule, everywhere this grammar is used — confirmed a single,
 * officially-supported `MarkdownParser.configure()` option
 * (`@lezer/markdown`'s own `remove` config, not a fork/custom dialect),
 * and confirmed empirically (real parse, both through this array directly
 * and through the full `markdown()` wrapper `markdownLanguage.ts` uses)
 * to leave `FencedCode`, list-nesting thresholds, and every other
 * construct's own parsing completely unaffected — `IndentedCode` is a
 * single, independently named block parser, entirely separate from
 * fenced code and from list-item nesting math. Placed in this shared
 * array (not duplicated in `markdownLanguage.ts` and
 * `tokenizeCompactMarkdown.ts` separately) specifically so both consumers
 * — the page editor and the sidebar's compact renderer — can never
 * disagree about which leading-indentation levels still count as a
 * paragraph/heading/blockquote/list vs. code, the same guarantee this
 * array already exists to provide for every other construct.
 *
 * **Consequence, deliberately accepted, not hidden**: a genuine,
 * intentionally-typed 4-space indented code block — anywhere, including
 * as a list item's own content — no longer parses as code inside Clutter
 * (falls back to an ordinary paragraph); fenced code blocks
 * (`` ``` ``) are the unaffected, fully-supported way to author code from
 * here on. This also means a Clutter document leaning on deep leading
 * indentation (now valid inside Clutter, up to the editor's own 20-space
 * ceiling — see `indent/markdownIndentContext.ts`) will render
 * differently in any standards-compliant external Markdown tool, which
 * has no way to know about this app-local parser configuration — an
 * unavoidable interop cost of the file format itself, not something this
 * configuration choice could avoid by being implemented differently.
 */
export const markdownGrammarExtensions: MarkdownExtension = [
  Autolink,
  Strikethrough,
  TaskList,
  Table,
  wikiLinkSyntax,
  embedSyntax,
  tagSyntax,
  dateSyntax,
  taskCompletionMetadataSyntax,
  highlightSyntax,
  wavyHorizontalRuleSyntax,
  doubleHorizontalRuleSyntax,
  dottedHorizontalRuleSyntax,
  labeledHorizontalRuleSyntax,
  emojiListSyntax,
  listMarkerParagraphInterrupt,
  { remove: ['IndentedCode'] },
];
