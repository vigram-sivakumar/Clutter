import { markdown } from '@codemirror/lang-markdown';

import { markdownGrammarExtensions } from './markdownGrammarExtensions';

/**
 * Markdown language support, scoped to a deliberate GFM subset plus the
 * WikiLink extension (§4):
 *
 * - `TaskList` (checklists) and `Strikethrough` are v1-scoped per the
 *   interaction spec.
 * - `Autolink` is enabled specifically so the future `@`-family precedence
 *   rule (`after: "Autolink"`) has something real to test against once
 *   that parser exists.
 * - `Table` is enabled (Phase 0 of the table milestone,
 *   docs/editor-feature-matrix.md — grammar only, no Live Preview
 *   rendering yet: an unstyled pipe table still shows its raw `|`/`-`
 *   syntax exactly as before this change). Registered `before:
 *   "SetextHeading"` by GFM's own bundle — confirmed empirically this
 *   only reclassifies text where the underline row *itself* also forms a
 *   valid pipe-delimiter row (`"A|B\n-|-"`); an ordinary Setext heading,
 *   even one whose heading line contains a stray `|`, is unaffected (see
 *   the Setext/Table precedence tests in
 *   `markdownLanguage.regression.test.ts`).
 * - `wikiLinkSyntax` registers the `WikiLink` node through the same public
 *   `MarkdownConfig` mechanism GFM itself uses — no second parser.
 * - `tagSyntax` registers the `Tag` node the same way — the first
 *   validation of the §11 stop-gate review's "two-kind proof, not one"
 *   plan (docs/editor-research/clutter-editor-semantic-tokens-audit.md):
 *   a second concrete semantic-token kind, built entirely on the same
 *   generic `semanticToken/*` mechanism WikiLink already proved out, with
 *   zero changes to that mechanism itself.
 * - `dateSyntax` registers the `Date` node — the first `@`-family
 *   construct (`@YYYY-MM-DD`). Context-free by construction: this parser
 *   never inspects surrounding block context (task checkbox or not) to
 *   decide whether something is a `Date` node — it always is. Task
 *   due-date semantics are assembled entirely downstream, by
 *   `TaskExtractor.ts`'s own independent bare-date recognition, never by
 *   this grammar.
 *
 * `Mention` and `PropertyToken` are not registered here yet — `dateSyntax`
 * is deliberately the first, not a generalized "AtSyntax" for all of
 * them, per the "leave an extension point, don't build the coordinator"
 * posture already applied to Tag.
 */
/**
 * `addKeymap: false`: this returns the language and grammar only, with no
 * key bindings at all. `markdownKeymap`'s two bindings are re-registered,
 * at the same `Prec.high` and with `deleteMarkupBackward` unchanged, by
 * `enter/markdownEnterKeymap.ts` — which needs to configure the Enter
 * command (`nonTightLists: false`) and prepend two narrow handlers for the
 * empty-continuation cases CM6 leaves unhandled. Leaving `addKeymap` on
 * would install a second, competing Enter binding at the same precedence;
 * see `docs/editor-architecture-decisions.md`'s forensic note on
 * hand-rolled keymaps racing lang-markdown's own defaults.
 *
 * Any caller mounting this for real editing must wire `markdownEnterKeymap()`
 * alongside it. Callers that only need the parser (tests reaching for
 * `.language`, decoration suites) are unaffected.
 */
export function markdownLanguageExtension() {
  return markdown({
    extensions: markdownGrammarExtensions,
    addKeymap: false,
  });
}
