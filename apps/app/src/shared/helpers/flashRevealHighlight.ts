// Same timing as the Markdown editor's own reveal-highlight lifecycle
// (editorRevealHighlight.ts's REVEAL_HIGHLIGHT_MS/REVEAL_FADE_MS) — kept
// in sync deliberately so a sidebar-row flash (e.g. "Reveal in Clutter")
// reads as the same visual language as the editor's line reveal, even
// though the mechanism here is plain DOM class toggles rather than a
// CodeMirror StateField/decoration (there is no CM6 document to decorate
// a sidebar row with).
const REVEAL_HIGHLIGHT_MS = 2500;
const REVEAL_FADE_MS = 400;

/**
 * Temporarily flashes `node` with Entry.css's `entry-reveal-highlight`/
 * `entry-reveal-highlight--visible` classes, then fades and clears them —
 * the sidebar-row counterpart to the editor's `cm-reveal-line`/
 * `cm-reveal-line--visible` toggle, reimplemented with plain `classList`
 * calls (no React state) since this targets an arbitrary DOM node by id,
 * not a component this caller necessarily re-renders.
 */
export function flashRevealHighlight(node: HTMLElement): void {
  node.classList.add('entry-reveal-highlight', 'entry-reveal-highlight--visible');

  window.setTimeout(() => {
    node.classList.remove('entry-reveal-highlight--visible');

    window.setTimeout(() => {
      node.classList.remove('entry-reveal-highlight');
    }, REVEAL_FADE_MS);
  }, REVEAL_HIGHLIGHT_MS);
}
