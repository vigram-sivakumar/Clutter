import type { EditorState } from '@codemirror/state';

/**
 * Computes the exact `[from, to)` range to delete for "Delete" on an Image
 * occurrence, given the Image node's own `from` — a real document-text
 * deletion, not a DOM/widget removal (the widget disappears as an
 * ordinary consequence of `imageLivePreview.ts` no longer finding an
 * `Image` node there on the next decoration rebuild, same as typing over
 * any other construct).
 *
 * Deleting only the node's own raw text (`![alt](url)`) would leave its
 * now-empty line behind, e.g.
 *
 *   Some text
 *   <blank>
 *   ![Mountain view](https://example.com/mountain.jpg)
 *   <blank>
 *   More text
 *
 * → (naive) →
 *
 *   Some text
 *   <blank>
 *   <blank>
 *   More text
 *
 * — an extra blank line, not the single-blank-line paragraph gap plain
 * Markdown expects between two paragraphs. Three cases, in order:
 *
 * 1. **The image is the document's only line** — delete everything.
 * 2. **The image is the document's first or last line** — trim every
 *    consecutive blank line on the *interior* side (the only side that can
 *    have a real paragraph to reconnect to) down to nothing, plus the one
 *    separator newline joining that run to whatever real content precedes/
 *    follows it. Deleting the very first or very last paragraph of a
 *    document must never leave a dangling leading/trailing blank line —
 *    there is no "single blank-line gap between two paragraphs" to
 *    preserve at a document edge, since there is only one paragraph there,
 *    not two.
 * 3. **The image sits between two other lines** — consume the image's own
 *    line plus **one** adjacent blank line (preferring the line before,
 *    falling back to the line after): this is what collapses a
 *    blank-line-delimited paragraph pair back down to a single gap,
 *    reproducing the worked example's exact expected output. Neither
 *    neighbor blank (image directly adjacent to real content on both
 *    sides) falls back to deleting just its own line.
 *
 * A pure function over `EditorState`/positions — no `EditorView`, no
 * dispatch — so it's directly testable and directly usable as a
 * `changes` spec by any caller (`ImageWidget.ts`'s Delete menu item).
 * Takes only the node's `from` (never `to`): the line-break guard already
 * shared by `imageLivePreview.ts`/`wikiLinkLivePreview.ts` guarantees an
 * Image node never crosses a line, so `from` alone is enough to identify
 * its one and only line.
 */
export function computeImageDeletionRange(state: EditorState, nodeFrom: number): { from: number; to: number } {
  const imageLine = state.doc.lineAt(nodeFrom);
  const isFirstLine = imageLine.number === 1;
  const isLastLine = imageLine.number === state.doc.lines;

  if (isFirstLine && isLastLine) {
    return { from: 0, to: state.doc.length };
  }

  if (isLastLine) {
    // Trim backward through every consecutive blank line immediately
    // before the image, then one more character to consume the newline
    // connecting that run to whatever real content precedes it (skipped
    // only if that would go negative, i.e. the run reaches the very start
    // of the document).
    let from = imageLine.from;
    for (let n = imageLine.number - 1; n >= 1; n--) {
      const line = state.doc.line(n);
      if (line.length !== 0) {
        break;
      }
      from = line.from;
    }
    if (from > 0) {
      from -= 1;
    }
    return { from, to: imageLine.to };
  }

  if (isFirstLine) {
    // Symmetric: trim forward through every consecutive blank line
    // immediately after the image, plus the newline connecting that run
    // to whatever real content follows it.
    let to = imageLine.to;
    for (let n = imageLine.number + 1; n <= state.doc.lines; n++) {
      const line = state.doc.line(n);
      if (line.length !== 0) {
        break;
      }
      to = line.to;
    }
    if (to < state.doc.length) {
      to += 1;
    }
    return { from: 0, to };
  }

  const prevLine = state.doc.line(imageLine.number - 1);
  if (prevLine.length === 0) {
    return { from: prevLine.from, to: lineEndInclusive(state, imageLine) };
  }

  const nextLine = state.doc.line(imageLine.number + 1);
  if (nextLine.length === 0) {
    return { from: imageLine.from, to: lineEndInclusive(state, nextLine) };
  }

  return { from: imageLine.from, to: lineEndInclusive(state, imageLine) };
}

/** A line's own end position, extended by one to also consume its trailing `\n` when it isn't the document's last line. */
function lineEndInclusive(state: EditorState, line: { number: number; to: number }): number {
  return line.number < state.doc.lines ? line.to + 1 : line.to;
}
