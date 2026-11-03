import { Autolink, Strikethrough, Table, TaskList, type MarkdownExtension } from '@lezer/markdown';

import { bareDomainSyntax } from './bareDomainSyntax';
import { dateSyntax } from './dateSyntax';
import { embedSyntax } from './embedSyntax';
import { emojiListSyntax } from './emojiListSyntax';
import { highlightSyntax } from './highlightSyntax';
import { imageSpacedDestinationSyntax } from './imageSyntax';
import { doubleHorizontalRuleSyntax } from './doubleHorizontalRuleSyntax';
import { dottedHorizontalRuleSyntax } from './dottedHorizontalRuleSyntax';
import { labeledHorizontalRuleSyntax } from './labeledHorizontalRuleSyntax';
import { wavyHorizontalRuleSyntax } from './wavyHorizontalRuleSyntax';
import { listMarkerParagraphInterrupt } from './listMarkerParagraphInterrupt';
import { tableLazyAbsorptionGuard } from './tableLazyAbsorptionGuard';
import { tagSyntax } from '@core/vault/ingest/tag/tagSyntax';
import { taskCompletionMetadataSyntax } from './taskCompletionMetadataSyntax';
import { wikiLinkSyntax } from './wikiLinkSyntax';

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
 * **Indented code is standard CommonMark here.** Four or more leading columns after a blank line (or at the start of a
 * block) are an indented code block (`CodeBlock`/`CodeText`), so `        - x` after a blank line is code, not a
 * bullet. An earlier version removed the `IndentedCode` block parser (2026-08-28, editor-indentation-ceiling) so deep
 * Tab-indentation never became code; that is reverted (2026-11-03) so Clutter reads Markdown the way every other
 * tool does. Lists still nest by the usual rule: a marker indented less than the parent item's content column plus
 * four is a nested item, and an indented line directly after a paragraph is that paragraph's lazy continuation.
 * This one shared array still keeps the editor and the compact renderer from disagreeing about any of it.
 */
function buildMarkdownGrammarExtensions(emojiLists: boolean): MarkdownExtension {
  return [
  Autolink,
  // Extends Autolink's own family: recognizes a scheme-less, www.-less
  // bare domain (example.com, example.co.uk/path) as the same URL node
  // Autolink produces for https://www. text, gated on a curated-gTLD +
  // real-two-letter-ccTLD rule (minus four named file-extension-colliding
  // exceptions) — see bareDomainScanner.ts's own doc comment for the full
  // rationale. Its own `after: 'Autolink'` field (resolved by name during
  // MarkdownParser.configure(), not by array position) is what actually
  // orders it after Autolink; placed here only for readability.
  bareDomainSyntax,
  Strikethrough,
  TaskList,
  Table,
  tableLazyAbsorptionGuard,
  wikiLinkSyntax,
  embedSyntax,
  imageSpacedDestinationSyntax,
  tagSyntax,
  dateSyntax,
  taskCompletionMetadataSyntax,
  highlightSyntax,
  wavyHorizontalRuleSyntax,
  doubleHorizontalRuleSyntax,
  dottedHorizontalRuleSyntax,
  labeledHorizontalRuleSyntax,
  ...(emojiLists ? [emojiListSyntax] : []),
  listMarkerParagraphInterrupt,
  ];
}

/**
 * The grammar with emoji lists on — the default, and the one every persisted/ingest consumer (`tagParser`, the
 * parsed-note cache) uses, since what is stored must not depend on a per-device preference.
 */
export const markdownGrammarExtensions: MarkdownExtension = buildMarkdownGrammarExtensions(true);

/**
 * The same grammar without `emojiListSyntax`: an emoji-led line is then an ordinary `Paragraph`, with no
 * `EmojiList`/`EmojiListMark` nodes. Used by the editor and the read-only renderer while the *Enable emoji lists*
 * setting is off; everything else about the grammar is identical.
 */
export const markdownGrammarExtensionsWithoutEmojiLists: MarkdownExtension = buildMarkdownGrammarExtensions(false);

/** The grammar for the *Enable emoji lists* setting's current value. */
export function markdownGrammarFor(emojiLists: boolean): MarkdownExtension {
  return emojiLists ? markdownGrammarExtensions : markdownGrammarExtensionsWithoutEmojiLists;
}
