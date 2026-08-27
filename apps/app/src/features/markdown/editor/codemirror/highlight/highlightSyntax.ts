import { Tag, tags } from '@lezer/highlight';
import type { DelimiterType, InlineContext, MarkdownConfig } from '@lezer/markdown';

const EQUALS = '='.charCodeAt(0);

// Mirrors `@lezer/markdown`'s own internal `Punctuation` regex exactly
// (`node_modules/@lezer/markdown/dist/index.js`) — not exported publicly,
// so re-declared here rather than imported. Used the same way GFM's own
// `Strikethrough` parser uses it: to decide whether a `=` run can open
// and/or close a delimiter based on the punctuation-vs-whitespace-vs-word
// character on either side (CommonMark's generic emphasis-flanking rule).
let Punctuation = /[!"#$%&'()*+,\-.\/:;<=>?@\[\\\]^_`{|}~\xA1‐-‧]/;
try {
  Punctuation = new RegExp('[\\p{S}|\\p{P}]', 'u');
} catch {
  // Engine without Unicode property escape support — fall back silently,
  // same as the library itself does.
}

/**
 * The content-styling tag for `Highlight` nodes, applied via `defineNodes`'
 * `style` field below and consumed by `markdownHighlightStyle.ts`'s
 * `HighlightStyle`. No stock `tags.highlight` exists in `@lezer/highlight`
 * (confirmed against the installed package — unlike `tags.strikethrough`,
 * which GFM's own `Strikethrough` extension reuses), so this is one local
 * `Tag.define()`, exported so `markdownHighlightStyle.ts` maps the exact
 * same tag instance to a CSS class rather than a structurally-equal but
 * distinct one.
 */
export const highlightContentTag = Tag.define();

const HighlightDelim: DelimiterType = { resolve: 'Highlight', mark: 'HighlightMark' };

/**
 * `==highlight==`, registered through `@lezer/markdown`'s public
 * `MarkdownConfig` mechanism. Not part of CommonMark/GFM, so (unlike
 * `Strikethrough`) this has to be defined here rather than merely enabled.
 *
 * `=` differs from `~` in one respect worth noting explicitly rather than
 * blindly inheriting: `=` has no other claimed meaning at the inline level
 * anywhere in this grammar (Setext headings' `===`/`---` underlines are a
 * block-level construct, checked by a separate parse phase before inline
 * parsing ever runs on that line — the same "block/inline never compete"
 * reasoning already established for `#tag` vs. ATX headings). So `after:
 * "Emphasis"` here is precedent-following, not the result of collision
 * analysis — there is no rival construct to prove precedence against.
 *
 * **Delimiter length policy (revised 2026-08-27 — see docs/editor-
 * architecture-decisions.md's Highlight-delimiter entry for the
 * investigation this replaced): any contiguous run of two or more `=`
 * opens or closes a Highlight delimiter; the opening and closing run
 * lengths never need to match.** This mirrors `@lezer/markdown`'s own
 * built-in `Emphasis` scanner exactly (confirmed against the installed
 * `@lezer/markdown@1.7.2` source: `Emphasis(cx, next, start)` scans
 * `while (cx.char(pos) == next) pos++` to find the *entire* run before
 * computing flanking, never a fixed-width slice) — scanning the whole run
 * here is the same primitive, just gated at `>= 2` instead of `>= 1`
 * (`=` needs a minimum width so a single incidental `=`, e.g. in `a=b`,
 * never opens a Highlight).
 *
 * **Deliberately NOT a full port of Emphasis's asymmetric-length
 * *peeling*** (the mechanism that turns `***text***` into nested
 * `Emphasis > StrongEmphasis`): that peeling logic lives in
 * `@lezer/markdown`'s internal `resolveMarkers`, hard-gated behind an
 * identity check against the library's own two singleton delimiter
 * objects (`EmphasisUnderscore`/`EmphasisAsterisk`) — confirmed by
 * reading `resolveMarkers` directly; there is no public extension point
 * that applies that behavior to a custom `DelimiterType` like
 * `HighlightDelim`. It's also not the same *kind* of ambiguity: Emphasis
 * has two distinct node types to peel into by length parity (`Emphasis`
 * vs `StrongEmphasis`); `Highlight` has exactly one node type regardless
 * of run length, so there is nothing meaningful to peel into. The
 * generic (non-Emphasis) path in `resolveMarkers` already does exactly
 * what's wanted here with zero further change: it wraps the full open
 * range and the full close range as-is, whatever their lengths, and
 * requires only that both delimiters share the same `type` — which every
 * Highlight delimiter does, regardless of its own run length. A
 * mismatched pair (e.g. `==text===`) therefore produces one `Highlight`
 * node whose two `HighlightMark`s are simply however wide their own run
 * actually was (2 and 3 characters respectively here) — consistent
 * because the *same rule* (mark = the actual matched run) applies
 * identically on both sides, not because the two sides are forced equal.
 */
export const highlightSyntax: MarkdownConfig = {
  defineNodes: [
    { name: 'Highlight', style: { 'Highlight/...': highlightContentTag } },
    // `tags.processingInstruction` — same generic punctuation-mark tag
    // every other construct's mark node uses (`HeaderMark`/`EmphasisMark`/
    // `StrikethroughMark`/`CodeMark`), so a revealed `==` gets the shared
    // `tok-mark` class rather than a one-off of its own.
    { name: 'HighlightMark', style: tags.processingInstruction },
  ],
  parseInline: [
    {
      name: 'Highlight',
      parse(cx: InlineContext, next: number, pos: number): number {
        if (next !== EQUALS) {
          return -1;
        }
        let scan = pos + 1;
        while (cx.char(scan) === EQUALS) scan++;
        if (scan - pos < 2) {
          return -1;
        }
        const before = cx.slice(pos - 1, pos);
        const after = cx.slice(scan, scan + 1);
        const spaceBefore = /\s|^$/.test(before);
        const spaceAfter = /\s|^$/.test(after);
        const punctBefore = Punctuation.test(before);
        const punctAfter = Punctuation.test(after);
        return cx.addDelimiter(
          HighlightDelim,
          pos,
          scan,
          !spaceAfter && (!punctAfter || spaceBefore || punctBefore),
          !spaceBefore && (!punctBefore || spaceAfter || punctAfter)
        );
      },
      after: 'Emphasis',
    },
  ],
};
