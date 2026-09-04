import { InlineContext, type MarkdownConfig } from '@lezer/markdown';

const BANG = '!'.charCodeAt(0);
const OPEN_BRACKET = '['.charCodeAt(0);
const BACKSLASH = '\\'.charCodeAt(0);
const OPEN_PAREN = '('.charCodeAt(0);
const CLOSE_PAREN = ')'.charCodeAt(0);

/**
 * A narrow supplementary `Image` rule — registered `before: 'Image'`, same
 * precedence slot `embedSyntax.ts` already uses — that activates **only**
 * for the one shape `@lezer/markdown`'s own native `Image` rule rejects
 * outright: a destination containing a raw, unescaped space with no
 * angle brackets (`<...>`) and no percent-encoding. Per CommonMark's own
 * destination grammar (confirmed directly against `@lezer/markdown`'s
 * `parseURL`, which breaks scanning at the very first whitespace
 * character when not angle-bracketed), `![Testing](Delete me.jpg)` does
 * not produce an `Image` node at all today — native parsing stops after
 * `![Testing]`, leaving `(Delete me.jpg)` as ordinary surrounding text.
 * That is spec-correct Markdown behavior, not a bug in the grammar — but
 * this project's own product requirement is that a literal space in a
 * local Vault filename must still work, unencoded, unbracketed, exactly
 * as written (`docs/editor-architecture-decisions.md`-style boundary: the
 * canonical Markdown a user types is never silently rewritten).
 *
 * Deliberately declines (`-1`) for every case native `Image` already
 * parses correctly — titles, angle-bracket/percent-encoded destinations,
 * reference-style links (`![alt][ref]`), shortcut references (`![alt]`),
 * and any destination with no raw space at all — so it can never compete
 * with or override native behavior for anything except the one shape that
 * would otherwise silently fail to parse. The one gate that decides
 * whether to activate is exactly "does the raw text between `](` and its
 * own matching, unescaped `)` contain whitespace" — nothing about title
 * detection, url validity, or Vault resolution belongs at this layer
 * (those stay exactly where they already are: `imageScanner.ts`'s
 * `scanImage()`, `resolveImageSrc.ts`).
 *
 * Reuses the *native* `'Image'` node type by name (`cx.elt('Image', ...)`,
 * not `defineNodes` — that's only for genuinely new node names) — every
 * downstream consumer (`imageLivePreview.ts`'s `node.name !== 'Image'`
 * check, `imageUiState.ts`'s `findEnclosingImageNode`, `imageScanner.ts`'s
 * own raw-text scan) is already node-name-agnostic about *which* rule
 * produced the node, so nothing downstream needs to change at all — the
 * only thing this file changes is whether an `Image` node gets produced in
 * the first place for this one destination shape.
 *
 * No internal children (`LinkMark`/`URL` sub-nodes native `Image` carries)
 * — nothing downstream reads them (`imageScanner.ts` re-slices the node's
 * own raw text directly, never walks its children); the only cost is a
 * cosmetic one, default syntax highlighting for the raw `(`/`)`/quote
 * characters while this construct's own source is explicitly revealed
 * (Edit source) — accepted as out of scope for this fix, the same way
 * `scanImage()` itself has never carried title/highlighting concerns.
 */
export const imageSpacedDestinationSyntax: MarkdownConfig = {
  parseInline: [
    {
      // Same `name: 'Image'` as the native rule this augments — deliberate,
      // not an oversight: `@lezer/markdown`'s own `configure()` REPLACES
      // (not layers via `before`) whichever `parseInline` entry already
      // has this exact `name` (confirmed directly against its source,
      // `resolveConfig`'s `inlineNames.indexOf(spec.name)` branch) — a
      // genuinely new name (the way `embedSyntax.ts`'s `'Embed'` is) would
      // sit *alongside* native Image via `before`, but native Image itself
      // never runs at all for anything this rule doesn't explicitly
      // delegate back to below. `before: 'Image'` is therefore inert here
      // (the replace branch never reads it) — kept only as documentation
      // of intent, not functional.
      name: 'Image',
      parse(cx: InlineContext, next: number, pos: number): number {
        if (next !== BANG || cx.char(pos + 1) !== OPEN_BRACKET) {
          return -1;
        }
        // No `![[...]]` (Embed) guard needed here: embedSyntax.ts's own
        // `Embed` rule is registered under a genuinely new node name
        // (`before: 'Image'`, which *does* layer additively for a new
        // name — only same-name registrations like this one replace), so
        // it always runs strictly before this rule is even tried at a
        // given `!` position and already only claims a position when
        // `scanEmbed` confirms it's a real embed. A naive "next two chars
        // are `[[`" guard here would be not just redundant but actively
        // wrong: `![[Alt]](url)` (a genuine Image whose alt text happens
        // to be a doubled bracket) starts with `![[` too, and Embed's own
        // lookahead already correctly declines it — this rule must not
        // second-guess that by re-applying a cruder version of the same
        // check (confirmed directly: doing so broke exactly this
        // pre-existing case, embedSyntax.test.ts's "is not stolen by
        // Embed" regression test).

        const text = cx.slice(pos, cx.end);
        const labelClose = text.indexOf('](', 2);
        const destinationStart = labelClose + 2;
        const destinationEnd =
          labelClose === -1 ? -1 : findUnescapedCloseParen(text, destinationStart);
        const destination =
          destinationEnd === -1 ? '' : text.slice(destinationStart, destinationEnd);

        if (destinationEnd !== -1 && /\s/.test(destination)) {
          // The one shape native Image rejects outright: a raw, unescaped
          // space in the destination. Produce the whole node immediately
          // (not via the delimiter-then-resolve mechanism below — nothing
          // needs deferring, the full `![alt](destination)` shape is
          // already fully known here).
          return cx.addElement(cx.elt('Image', pos, pos + destinationEnd + 1));
        }

        // Every other case (no raw space, or not even a well-formed
        // `![...](...)` shape at all — e.g. `![alt][ref]`,
        // `![shortcut]`, or plain unmatched `![`) — defer to *exactly*
        // what native Image's own inline rule does at this position: open
        // an ImageStart delimiter and let the later `]`-triggered
        // resolution (native, untouched — `LinkEnd`/`finishLink`, which
        // this file has no access to and does not reimplement) handle
        // titles, angle-bracket/percent-encoded destinations, reference-
        // style links, and unmatched brackets exactly as it always has.
        return cx.addDelimiter(InlineContext.imageStart, pos, pos + 2, true, false);
      },
    },
  ],
};

/**
 * Mirrors `@lezer/markdown`'s own internal `parseURL` depth-tracking loop
 * (paren-balancing + backslash-escape handling) exactly, with one
 * deliberate difference: it does not stop at whitespace. Never crosses a
 * newline — `text` here is `InlineContext`'s own text (already scoped to
 * one inline/paragraph section), and `imageLivePreview.ts`'s own
 * line-break guard is the second, belt-and-suspenders layer against an
 * `Image` node ever spanning a line break, same as every other construct
 * in this codebase.
 */
function findUnescapedCloseParen(text: string, start: number): number {
  let depth = 0;
  for (let pos = start; pos < text.length; pos++) {
    const code = text.charCodeAt(pos);
    if (code === 10 /* \n */) {
      return -1;
    }
    if (code === BACKSLASH) {
      pos++; // Skip the escaped character — it can't close/open a paren.
      continue;
    }
    if (code === OPEN_PAREN) {
      depth++;
    } else if (code === CLOSE_PAREN) {
      if (depth === 0) {
        return pos;
      }
      depth--;
    }
  }
  return -1;
}
