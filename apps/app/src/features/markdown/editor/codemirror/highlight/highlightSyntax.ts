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
 * `MarkdownConfig` mechanism — structurally identical to GFM's own
 * `Strikethrough` (confirmed directly against the installed
 * `@lezer/markdown@1.7.2` source): a delimiter-pair construct built on
 * `cx.addDelimiter`, `after: "Emphasis"`, resolving to two `HighlightMark`
 * children bracketing content. Not part of CommonMark/GFM, so (unlike
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
 * The triple-run guard (`cx.char(pos + 2) === EQUALS` rejects opening
 * inside `===`) mirrors `Strikethrough`'s identical guard against `~~~`
 * character-for-character. Consequence, also inherited unchanged from
 * `Strikethrough`: `===text===` rejects at the first `=` (its third
 * character is also `=`) but the parser then retries one position over,
 * where `==text==` matches starting at the second `=` — leaving one
 * literal `=` on each side outside the `Highlight` node. This is the
 * reference implementation's own behavior for `~~~text~~~`, not a gap
 * introduced here.
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
        if (next !== EQUALS || cx.char(pos + 1) !== EQUALS || cx.char(pos + 2) === EQUALS) {
          return -1;
        }
        const before = cx.slice(pos - 1, pos);
        const after = cx.slice(pos + 2, pos + 3);
        const spaceBefore = /\s|^$/.test(before);
        const spaceAfter = /\s|^$/.test(after);
        const punctBefore = Punctuation.test(before);
        const punctAfter = Punctuation.test(after);
        return cx.addDelimiter(
          HighlightDelim,
          pos,
          pos + 2,
          !spaceAfter && (!punctAfter || spaceBefore || punctBefore),
          !spaceBefore && (!punctBefore || spaceAfter || punctAfter)
        );
      },
      after: 'Emphasis',
    },
  ],
};
