import { Autolink, Strikethrough, Table, TaskList, type MarkdownExtension } from '@lezer/markdown';

import { dateSyntax } from './date/dateSyntax';
import { emojiListSyntax } from './emoji-list/emojiListSyntax';
import { highlightSyntax } from './highlight/highlightSyntax';
import { wavyHorizontalRuleSyntax } from './hr/wavyHorizontalRuleSyntax';
import { tagSyntax } from './tag/tagSyntax';
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
 */
export const markdownGrammarExtensions: MarkdownExtension = [
  Autolink,
  Strikethrough,
  TaskList,
  Table,
  wikiLinkSyntax,
  tagSyntax,
  dateSyntax,
  highlightSyntax,
  wavyHorizontalRuleSyntax,
  emojiListSyntax,
];
