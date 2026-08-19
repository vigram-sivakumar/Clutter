import { markdown } from '@codemirror/lang-markdown';
import { Autolink, Strikethrough, TaskList } from '@lezer/markdown';

import { tagSyntax } from './tag/tagSyntax';
import { wikiLinkSyntax } from './wikilink/wikiLinkSyntax';

/**
 * Markdown language support, scoped to a deliberate GFM subset plus the
 * WikiLink extension (§4):
 *
 * - `TaskList` (checklists) and `Strikethrough` are v1-scoped per the
 *   interaction spec.
 * - `Autolink` is enabled specifically so the future `@`-family precedence
 *   rule (`after: "Autolink"`) has something real to test against once
 *   that parser exists.
 * - `Table` is deliberately NOT enabled. Tables are explicitly deferred
 *   (interaction spec, Category E) — this is a reversible config choice,
 *   not an architectural one, and is omitted here so it reads as
 *   intentional rather than an oversight.
 * - `wikiLinkSyntax` registers the `WikiLink` node through the same public
 *   `MarkdownConfig` mechanism GFM itself uses — no second parser.
 * - `tagSyntax` registers the `Tag` node the same way — the first
 *   validation of the §11 stop-gate review's "two-kind proof, not one"
 *   plan (docs/editor-research/clutter-editor-semantic-tokens-audit.md):
 *   a second concrete semantic-token kind, built entirely on the same
 *   generic `semanticToken/*` mechanism WikiLink already proved out, with
 *   zero changes to that mechanism itself.
 *
 * `Mention` and `PropertyToken` are not registered here yet.
 */
export function markdownLanguageExtension() {
  return markdown({
    extensions: [Autolink, Strikethrough, TaskList, wikiLinkSyntax, tagSyntax],
  });
}
