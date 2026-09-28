import { syntaxTree } from '@codemirror/language';
import { RangeSet, RangeValue, StateEffect, StateField, type EditorState } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';

/**
 * Per-pasted-URL-occurrence tracking for the transient "Paste as" menu.
 * A `RangeSet` keyed by each occurrence's own `[from, to)` span (`endSide
 * = -1`, same pattern as `imageUiState.ts`'s `ImageUiValue`) gives every
 * occurrence a stable `id` independent of text content — the mechanism
 * that lets duplicate pasted URLs stay independently addressable, without
 * ever needing `markdown.indexOf(url)`.
 *
 * An entry exists only while its menu is still open/pending a choice.
 * Both outcomes ("Markdown link" converts the doc synchronously, "URL"
 * leaves it alone) remove the entry via `clearUrlPasteEntry` in the same
 * transaction — its absence is itself the "never show the menu again for
 * this occurrence" record. There is no async/in-flight state: the
 * conversion is a synchronous CM6 transaction, so nothing needs to be
 * tracked once a choice is made.
 */
export interface UrlPasteEntry {
  readonly id: number;
  readonly from: number;
  readonly to: number;
  readonly url: string;
}

let nextUrlPasteOccurrenceId = 0;

class UrlPasteValue extends RangeValue {
  constructor(
    readonly id: number,
    readonly url: string
  ) {
    super();
  }

  // An insertion landing exactly at the span's own `to` (continuing to
  // type right after the pasted URL) must not grow the tracked range,
  // while an edit strictly inside it (editing the URL text itself) must —
  // same reasoning as `ImageUiValue.endSide` (imageUiState.ts).
  override readonly endSide = -1;

  override eq(other: RangeValue): boolean {
    return other instanceof UrlPasteValue && other.id === this.id && other.url === this.url;
  }
}

export const clearUrlPasteEntry = StateEffect.define<number>();

/** A usable HTTPS-scheme URL string, per the locked "only https:// is eligible" product rule. */
function isEligibleHttpsUrl(text: string): boolean {
  try {
    return new URL(text).protocol === 'https:';
  } catch {
    return false;
  }
}

/** A bare domain host, e.g. `example.com` or `www.example.com` — at least
 * one dot-separated label, no scheme, no spaces. */
function isDomainLikeHost(host: string): boolean {
  return /^[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+$/.test(host);
}

/**
 * Text eligible for the paste menu: `isEligibleHttpsUrl`'s existing
 * explicit-`https://` rule, widened to also accept a domain-like
 * destination with no scheme at all (`example.com`, `example.com/path`).
 * A relative Markdown destination (`./docs`, `../docs`, `#section`) never
 * has a dot-separated host up front, so it never matches here — this
 * check only recognizes *this* text as a URL candidate for the menu; it
 * never rewrites it (the pasted text is stored and later inserted
 * unchanged, see `entry.url` below).
 */
function isEligiblePasteUrlText(text: string): boolean {
  if (isEligibleHttpsUrl(text)) {
    return true;
  }
  const host = text.split(/[/?#]/, 1)[0] ?? '';
  return isDomainLikeHost(host);
}

/**
 * The node whose own range is exactly `[fromB, toB)` — climbing from
 * Lezer's innermost `resolve()` result (which, for a boundary position,
 * may land on a descendant narrower than the full pasted range, e.g. a
 * `Link`'s own opening `LinkMark` rather than the `Link` itself) up to the
 * first ancestor whose bounds match the whole paste exactly.
 */
function resolveExactNode(state: EditorState, fromB: number, toB: number): SyntaxNode | null {
  let node: SyntaxNode | null = syntaxTree(state).resolve(fromB, 1);
  while (node && (node.from !== fromB || node.to !== toB)) {
    node = node.parent;
  }
  return node;
}

/**
 * True when `fromB..toB` is exactly a bare `URL` Lezer node's own range in
 * `state`'s (already-updated) syntax tree — not a child of `Link`,
 * `Autolink`, or `Image` (existing Markdown links/autolinks/image sources
 * are explicitly excluded), and not merely a substring of a larger paste.
 */
function isBarePastedUrlNode(state: EditorState, fromB: number, toB: number): boolean {
  const node = resolveExactNode(state, fromB, toB);
  if (!node || node.name !== 'URL') {
    return false;
  }
  const parentName = node.parent?.name;
  return parentName !== 'Link' && parentName !== 'Autolink' && parentName !== 'Image';
}

/**
 * True when `fromB..toB` is exactly a `Link` node whose label is itself a
 * bare `URL` node — `[www.example.com](https://www.example.com)`, the
 * shape produced when the pasted text is really just a domain-like URL
 * doubled as its own label. A genuine descriptive link
 * (`[Example](https://example.com)`) never has a label that parses as its
 * own `URL` node — Lezer only recognizes `www.example.com`-shaped text
 * that way — so it stays excluded exactly as before, without inspecting
 * the label text at all.
 */
function isDomainLabeledLinkPaste(state: EditorState, fromB: number, toB: number): boolean {
  const node = resolveExactNode(state, fromB, toB);
  if (!node || node.name !== 'Link') {
    return false;
  }
  const openMark = node.firstChild;
  const label = openMark?.nextSibling ?? null;
  const labelCloseMark = label?.nextSibling ?? null;
  return (
    !!openMark &&
    openMark.name === 'LinkMark' &&
    !!label &&
    label.name === 'URL' &&
    !!labelCloseMark &&
    labelCloseMark.name === 'LinkMark' &&
    label.from === openMark.to &&
    label.to === labelCloseMark.from
  );
}

function hasExcludedPasteAncestor(node: SyntaxNode): boolean {
  for (let n: SyntaxNode | null = node; n; n = n.parent) {
    if (n.name === 'Link' || n.name === 'Autolink' || n.name === 'Image') {
      return true;
    }
  }
  return false;
}

/**
 * True when `fromB..toB` is plain text (no `URL`/`Link`/`Autolink` node of
 * its own — those are handled by `isBarePastedUrlNode`/
 * `isDomainLabeledLinkPaste` above) that is, in its entirety, a domain-like
 * destination with no scheme — `google.co.in`, `example.com/path`. Lezer's
 * autolink recognition requires an explicit scheme or a `www.` prefix, so
 * a bare domain like `google.co.in` never becomes its own `URL` node at
 * all; this is the fallback that still recognizes it as a URL candidate
 * for the menu, purely from the pasted text itself.
 */
function isPlainDomainLikePaste(state: EditorState, fromB: number, toB: number): boolean {
  const node = syntaxTree(state).resolve(fromB, 1);
  if (node.name === 'URL' || node.name === 'Link' || node.name === 'Autolink') {
    return false;
  }
  if (hasExcludedPasteAncestor(node)) {
    return false;
  }
  const text = state.sliceDoc(fromB, toB);
  const host = text.split(/[/?#]/, 1)[0] ?? '';
  return isDomainLikeHost(host);
}

export const urlPasteChoiceField = StateField.define<RangeSet<UrlPasteValue>>({
  create: () => RangeSet.empty,
  update(value, tr) {
    let next = value.map(tr.changes);

    for (const effect of tr.effects) {
      if (effect.is(clearUrlPasteEntry)) {
        const id = effect.value;
        next.between(0, tr.state.doc.length, (from, _to, entry) => {
          if (entry.id === id) {
            next = next.update({ filter: (f) => f !== from });
          }
        });
      }
    }

    // Drop any entry whose tracked text no longer matches the URL it was
    // created for — a genuine edit to the pasted URL (not merely the
    // caret moving through/around it) retires this occurrence rather
    // than show a menu for content the user changed.
    if (tr.docChanged) {
      const stale: number[] = [];
      next.between(0, tr.state.doc.length, (from, to, entry) => {
        if (tr.state.sliceDoc(from, to) !== entry.url) {
          stale.push(entry.id);
        }
      });
      for (const id of stale) {
        next.between(0, tr.state.doc.length, (from, _to, entry) => {
          if (entry.id === id) {
            next = next.update({ filter: (f) => f !== from });
          }
        });
      }
    }

    // Seeds a fresh entry for a just-pasted bare URL (an explicit
    // https:// URL, a domain-like destination with no scheme, or a
    // domain-labeled Link) — the one and only creation path, gated on
    // `tr.isUserEvent('input.paste')` (CM6's own tag for a
    // paste-originated transaction, @codemirror/view's `doPaste`) so the
    // menu never appears for typed URLs, existing links, or a cursor
    // merely re-entering old text.
    if (tr.docChanged && tr.isUserEvent('input.paste')) {
      tr.changes.iterChangedRanges((_fromA, _toA, fromB, toB) => {
        const eligible =
          (isBarePastedUrlNode(tr.state, fromB, toB) &&
            isEligiblePasteUrlText(tr.state.sliceDoc(fromB, toB))) ||
          isDomainLabeledLinkPaste(tr.state, fromB, toB) ||
          isPlainDomainLikePaste(tr.state, fromB, toB);
        if (eligible) {
          const url = tr.state.sliceDoc(fromB, toB);
          next = next.update({
            add: [new UrlPasteValue(nextUrlPasteOccurrenceId++, url).range(fromB, toB)],
          });
        }
      });
    }

    return next;
  },
});

export function getUrlPasteEntries(state: EditorState): UrlPasteEntry[] {
  const entries: UrlPasteEntry[] = [];
  state.field(urlPasteChoiceField, false)?.between(0, state.doc.length, (from, to, value) => {
    entries.push({ id: value.id, from, to, url: value.url });
  });
  return entries;
}

export function findUrlPasteEntryById(state: EditorState, id: number): UrlPasteEntry | null {
  let found: UrlPasteEntry | null = null;
  state.field(urlPasteChoiceField, false)?.between(0, state.doc.length, (from, to, value) => {
    if (value.id === id) {
      found = { id: value.id, from, to, url: value.url };
      return false;
    }
  });
  return found;
}
