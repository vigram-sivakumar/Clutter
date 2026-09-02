export interface ImageMatch {
  readonly alt: string;
  readonly url: string;
}

/**
 * Parses a native CommonMark `Image` node's own raw text
 * (`![alt](url)`/`![alt](url "title")`) into alt/url. Deliberately a raw-
 * text scan, not a syntax-tree read — mirrors `scanTag`/`scanDate`'s own
 * shape, which is what makes this pluggable into `widgetReplaceRenderer`'s
 * `(raw: string) => WidgetType | null` contract unchanged.
 *
 * Only ever called with a node the Lezer grammar has already validated as
 * a well-formed `Image` (native CommonMark, not a Clutter grammar
 * extension), so this does not need to re-validate the outer `![...](...)`
 * shape — only to locate the two boundaries within it. An optional link
 * title (`(url "title")`) is recognized and discarded: the title is not
 * part of Phase 1's scope (no caption/tooltip UI yet), only the URL itself
 * is used as `<img src>`.
 *
 * **An empty (or whitespace-only) destination — `![alt]()` — is treated as
 * incomplete, returning `null` the same as a missing `)` would.** This is
 * not a cosmetic choice: `createEditorView.ts`'s CM6 setup includes
 * `closeBrackets()`, which auto-inserts the matching `)` the instant a
 * user types `(` after `![alt]` — meaning `![alt](` (still genuinely
 * mid-typing the destination) becomes `![alt]()` in the actual document
 * the instant that one keystroke lands, with the cursor placed between
 * the parens. Structurally `![alt]()` *is* a syntactically complete Lezer
 * `Image` node (it has `](` and a closing `)`), so without this check an
 * `ImageWidget` would be constructed with `url: ''`, and `img.src = ''`
 * fails to load immediately — flipping straight to the broken-image state
 * before the user has typed a single character of the actual destination.
 * Confirmed directly against the real editor, not assumed: reproduced by
 * typing `![text]` then `(` alone and observing the broken representation
 * render instantly. Treating an empty destination as "not yet a complete
 * image" (same bucket as `![alt](`/`![alt](http` — see
 * `imageLivePreview.test.ts`'s "Incomplete image syntax" coverage) instead
 * keeps the auto-closed `()` as plain, directly-editable raw Markdown
 * until real destination text exists between the parens.
 */
export function scanImage(raw: string): ImageMatch | null {
  if (!raw.startsWith('![')) {
    return null;
  }

  const labelClose = raw.indexOf('](', 2);
  if (labelClose === -1) {
    return null;
  }

  if (!raw.endsWith(')')) {
    return null;
  }

  const alt = raw.slice(2, labelClose);
  const destination = raw.slice(labelClose + 2, -1);

  // A link title, if present, is separated from the URL by whitespace
  // (`url "title"` or `url 'title'`) — take only the first token.
  const url = destination.trim().split(/\s+/)[0] ?? '';

  if (!url) {
    return null;
  }

  return { alt, url };
}
