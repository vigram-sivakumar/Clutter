import type { EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

/**
 * Computes the exact `[from, to)` range to delete for "Remove" on an
 * embed occurrence (Image, PDF, or any future embed kind), given the
 * node's own `from` — a real document-text deletion, not a DOM/widget
 * removal (the widget disappears as an ordinary consequence of the
 * owning live-preview extension no longer finding a matching node there
 * on the next decoration rebuild, same as typing over any other
 * construct). This is the one mechanism behind every "Remove" action in
 * the editor — it only ever edits the current note's own Markdown text,
 * never the underlying resource; see `invalidEmbedCard.ts`'s own
 * `onDelete` doc comment and `resourceActionLabels.ts` for the
 * Remove-vs-Archive product rule this enforces.
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
 * 1. **The embed is the document's only line** — delete everything.
 * 2. **The embed is the document's first or last line** — trim every
 *    consecutive blank line on the *interior* side (the only side that can
 *    have a real paragraph to reconnect to) down to nothing, plus the one
 *    separator newline joining that run to whatever real content precedes/
 *    follows it. Deleting the very first or very last paragraph of a
 *    document must never leave a dangling leading/trailing blank line —
 *    there is no "single blank-line gap between two paragraphs" to
 *    preserve at a document edge, since there is only one paragraph there,
 *    not two.
 * 3. **The embed sits between two other lines** — consume the embed's own
 *    line plus **one** adjacent blank line (preferring the line before,
 *    falling back to the line after): this is what collapses a
 *    blank-line-delimited paragraph pair back down to a single gap,
 *    reproducing the worked example's exact expected output. Neither
 *    neighbor blank (embed directly adjacent to real content on both
 *    sides) falls back to deleting just its own line.
 *
 * A pure function over `EditorState`/positions — no `EditorView`, no
 * dispatch — so it's directly testable and directly usable as a
 * `changes` spec by any caller (`ImageWidget.ts`'s and
 * `PdfEmbedWidget.ts`'s own "Remove" controls, plus every broken-embed
 * card's "Remove" button via `invalidEmbedCard.ts`). Takes only the
 * node's `from` (never `to`): the line-break guard already shared by
 * `imageLivePreview.ts`/`embedLivePreview.ts`/`wikiLinkLivePreview.ts`
 * guarantees an embed node never crosses a line, so `from` alone is
 * enough to identify its one and only line.
 */
export function computeEmbedRemovalRange(state: EditorState, nodeFrom: number): { from: number; to: number } {
  const embedLine = state.doc.lineAt(nodeFrom);
  const isFirstLine = embedLine.number === 1;
  const isLastLine = embedLine.number === state.doc.lines;

  if (isFirstLine && isLastLine) {
    return { from: 0, to: state.doc.length };
  }

  if (isLastLine) {
    // Trim backward through every consecutive blank line immediately
    // before the embed, then one more character to consume the newline
    // connecting that run to whatever real content precedes it (skipped
    // only if that would go negative, i.e. the run reaches the very start
    // of the document).
    let from = embedLine.from;
    for (let n = embedLine.number - 1; n >= 1; n--) {
      const line = state.doc.line(n);
      if (line.length !== 0) {
        break;
      }
      from = line.from;
    }
    if (from > 0) {
      from -= 1;
    }
    return { from, to: embedLine.to };
  }

  if (isFirstLine) {
    // Symmetric: trim forward through every consecutive blank line
    // immediately after the embed, plus the newline connecting that run
    // to whatever real content follows it.
    let to = embedLine.to;
    for (let n = embedLine.number + 1; n <= state.doc.lines; n++) {
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

  const prevLine = state.doc.line(embedLine.number - 1);
  if (prevLine.length === 0) {
    return { from: prevLine.from, to: lineEndInclusive(state, embedLine) };
  }

  const nextLine = state.doc.line(embedLine.number + 1);
  if (nextLine.length === 0) {
    return { from: embedLine.from, to: lineEndInclusive(state, nextLine) };
  }

  return { from: embedLine.from, to: lineEndInclusive(state, embedLine) };
}

/** A line's own end position, extended by one to also consume its trailing `\n` when it isn't the document's last line. */
function lineEndInclusive(state: EditorState, line: { number: number; to: number }): number {
  return line.number < state.doc.lines ? line.to + 1 : line.to;
}

/** The common Remove action: one document edit, never a source-file operation. */
export function removeEmbed(view: EditorView, nodeFrom: number): void {
  const { from, to } = computeEmbedRemovalRange(view.state, nodeFrom);
  view.dispatch({ changes: { from, to, insert: '' } });
}
