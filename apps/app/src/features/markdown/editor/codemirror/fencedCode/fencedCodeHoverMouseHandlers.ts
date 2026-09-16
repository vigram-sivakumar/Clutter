import { foldState, syntaxTree } from '@codemirror/language';
import type { EditorState, Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';

import { nearestFencedCode } from '../highlight/fencedCodeBlockLineDecoration';
import { docRelativeBase, fencedCodeVisualBounds } from './fencedCodeBlockGeometry';
import { resolveFencedCodeOpeningLine } from './fencedCodeInfoRange';

/**
 * One shared "is the pointer anywhere inside this `FencedCode` node's
 * full range" hover state, driving *every* control that lives on the
 * opening line — fold toggle, Copy, and "More actions" — rather than
 * three independent hover detectors. Requested directly after building
 * the fold-only version of this mechanism: the fold toggle, Copy, and
 * Actions all want the identical signal ("hovering anywhere in this
 * block reveals the chrome anchored to its opening line"), so computing
 * it three times would be exactly the kind of duplicated fenced-code
 * ownership logic this codebase's own conventions warn against.
 *
 * **Expanded**: not hovered → fold/Copy/Actions all hidden; hovered
 * anywhere in the block → all three visible. **Collapsed**: fold stays
 * unconditionally visible (via the existing generic
 * `.cm-fold-toggle[data-folded='true']` CSS rule, untouched, since it's
 * the only affordance left to reopen the block); Copy/Actions still
 * follow this same shared hover class — for a collapsed block, "hover
 * the one remaining visible line" and "hover the block" are the same
 * event by construction, so no separate collapsed-specific detection is
 * needed either.
 *
 * **Why one shared class, not three independent DOM listeners.** All
 * three controls are ordinary children of the *same* opening line
 * (`resolveFencedCodeOpeningLine` — already established in
 * `fencedCodeInfoRange.ts` for exactly this "find this block's own
 * opening-line element fresh from the DOM" need, reused here rather than
 * re-implementing the same `view.domAtPos` walk a third time), so one
 * `querySelectorAll` inside that line finds every control that currently
 * exists (Copy/Actions may be absent in a read-only nested view) and
 * applies the identical class to each.
 *
 * See `fencedCodeBackgroundLayer.ts`'s own doc comment for the general
 * "why `domEventHandlers`/`posAtCoords`, why event-driven not polling"
 * reasoning this file shares; not repeated here.
 */

const HOVER_CLASS = 'cm-fenced-code-hovering';
const CONTROL_SELECTOR = '.cm-fold-toggle, .cm-code-block-copy, .cm-code-block-actions';

function controlsFor(view: EditorView, fencedCodeFrom: number): HTMLElement[] {
  const line = resolveFencedCodeOpeningLine(view, fencedCodeFrom);
  return line ? Array.from(line.querySelectorAll<HTMLElement>(CONTROL_SELECTOR)) : [];
}

/**
 * `nearestFencedCode` resolves with `side: 1` ("prefer the node starting
 * here") — correct for its own established callers (line starts, anchor
 * positions with real content following), but a real bug found live for
 * *this* file's own use: `posAtCoords` for a hover past the last rendered
 * character of a folded block's own visible line (nothing else follows
 * it — everything after is hidden) snaps to the *document's own end*
 * position, which `resolveInner(pos, 1)` at that trailing boundary
 * resolves to the enclosing `Document`, not the last `FencedCode` node —
 * the same boundary-resolution fact already established for
 * `fencedCodeFenceAutoClose.ts`'s own deliberately-separate `side: -1`
 * resolver (that file's own doc comment; not reused here directly, since
 * its own contract is specific to a different call shape). Falling back
 * to `side: -1` ("prefer the node ending here") only when the `side: 1`
 * query finds nothing recovers exactly this case, since a hover
 * hit-test — unlike a text-editing position — has no "typing direction"
 * to prefer one side over the other in the first place.
 */
function resolveFencedCodeHit(state: EditorState, pos: number): SyntaxNode | null {
  const forward = nearestFencedCode(state, pos);
  if (forward) {
    return forward;
  }
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, -1);
  for (; node; node = node.parent) {
    if (node.name === 'FencedCode') {
      return node;
    }
  }
  return null;
}

export function fencedCodeHoverMouseHandlers(): Extension {
  let hoveredFrom: number | null = null;
  let lastX = 0;
  let lastY = 0;

  function apply(view: EditorView) {
    const pos = view.posAtCoords({ x: lastX, y: lastY });
    const candidate = pos == null ? null : resolveFencedCodeHit(view.state, pos);
    // Geometric confirmation, not just "some position resolved to this
    // node" — the same discipline `semanticToken/tokenMouseHandlers.ts`'s
    // own `isWithinTokenBounds` already established for clicks: verify the
    // pointer's actual position falls within this node's own real
    // rendered bounds (`fencedCodeVisualBounds`, shared with
    // `fencedCodeBackgroundLayer.ts`) before trusting it. Catches any
    // remaining case where a resolved position technically belongs to a
    // node whose visible geometry the pointer isn't actually over.
    //
    // **`lastY` (raw `event.clientY`, viewport-relative) must be converted
    // to the same document-relative space `fencedCodeVisualBounds` returns
    // before comparing — a real bug found live, not just theorized.**
    // `view.lineBlockAt(...).top` never changes with scroll; `clientY`
    // always does. Comparing them directly silently failed this exact
    // check the instant the page was scrolled away from its initial
    // position (i.e. almost always in practice), which is why "hover a
    // collapsed block past its visible text" first appeared broken.
    const bounds = candidate ? fencedCodeVisualBounds(view, candidate) : null;
    const docRelativeY = lastY - docRelativeBase(view).top;
    const owner =
      bounds && docRelativeY >= bounds.top - 1 && docRelativeY <= bounds.bottom + 1 ? candidate : null;
    const nextFrom = owner?.from ?? null;

    if (nextFrom === hoveredFrom) {
      // Same block (or still nothing) — but the controls' own DOM nodes
      // may have been replaced since (fold/unfold rebuilds the toggle;
      // see the `updateListener` below), so re-assert rather than assume
      // the class survived.
      if (nextFrom !== null) {
        controlsFor(view, nextFrom).forEach((el) => el.classList.add(HOVER_CLASS));
      }
      return;
    }

    if (hoveredFrom !== null) {
      controlsFor(view, hoveredFrom).forEach((el) => el.classList.remove(HOVER_CLASS));
    }
    if (nextFrom !== null) {
      controlsFor(view, nextFrom).forEach((el) => el.classList.add(HOVER_CLASS));
    }
    hoveredFrom = nextFrom;
  }

  return [
    EditorView.domEventHandlers({
      mouseover(event, view) {
        lastX = event.clientX;
        lastY = event.clientY;
        apply(view);
        return false;
      },
      mouseleave(_event, view) {
        if (hoveredFrom !== null) {
          controlsFor(view, hoveredFrom).forEach((el) => el.classList.remove(HOVER_CLASS));
          hoveredFrom = null;
        }
        return false;
      },
    }),
    EditorView.updateListener.of((update) => {
      if (
        hoveredFrom !== null &&
        update.startState.field(foldState, false) !== update.state.field(foldState, false)
      ) {
        // Deferred to the next frame, not called synchronously here — a
        // real bug found live, not just theorized: `apply()`'s own
        // `view.domAtPos`/`querySelectorAll` reads, run *inside*
        // `updateListener` (i.e. while CM6 is still mid-reconciliation
        // for this same transaction), caused the Copy button to be
        // duplicated on the just-folded line rather than reused — a
        // stray extra `.cm-code-block-copy` sibling, confirmed via direct
        // DOM inspection, reproduced only with this listener wired in and
        // absent on the pre-change code. `layer()`'s own internal
        // mechanism (`fencedCodeBackgroundLayer.ts`) never measures
        // synchronously inside its own update hook either, for the same
        // reason — it defers via `requestMeasure`. One `view` reference is
        // still safe to close over across the frame boundary: CM6 doesn't
        // replace the `EditorView` instance itself between updates, only
        // its internal state/DOM.
        const view = update.view;
        requestAnimationFrame(() => apply(view));
      }
    }),
  ];
}
