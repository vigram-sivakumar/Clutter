import { foldedRanges } from '@codemirror/language';
import { EditorSelection, type EditorState, type SelectionRange } from '@codemirror/state';
import { Direction, type Command, type EditorView, type KeyBinding } from '@codemirror/view';

/**
 * Makes ArrowLeft/ArrowRight treat a folded range as a single unit to step
 * over, never as hidden text to step *into* — the opposite of
 * `@codemirror/language`'s own default `foldState` behavior (its
 * `clearTouchedFolds`, run on every transaction that sets a selection,
 * auto-*unfolds* the moment the head would land inside a folded range).
 * That default is exactly right for ArrowUp/ArrowDown and mouse clicks —
 * deliberately untouched here — but was found to be the wrong UX
 * specifically for horizontal caret stepping across a fold's own
 * boundary, where the request is "skip over it, don't silently expand
 * it." `codeFolding()`, `foldKeymap`, `indentedParagraphFoldService()`,
 * and `foldToggleDecoration()` are all completely unmodified by this —
 * this is a keymap-precedence override of two commands only, never a
 * change to fold detection, fold state, or the toggle UI.
 *
 * **Never touches Shift-ArrowLeft/Shift-ArrowRight** (selection
 * extension) — CM6's keymap resolution matches "ArrowLeft" and
 * "Shift-ArrowLeft" as distinct key strings, so registering only the
 * bare keys here leaves `selectCharLeft`/`selectCharRight` (and every
 * other modifier combination) completely unreachable from this file,
 * exactly as the task's own "preserve existing mouse behavior and
 * explicit fold/unfold controls" scope implies — extending a selection
 * across a fold is a separate question this file doesn't answer.
 *
 * **Deliberately declines (`return false`) for every case that isn't a
 * genuine fold-boundary crossing** — checked twice, not once: first a
 * cheap `foldedRanges(state).size === 0` bail-out (the overwhelming
 * common case, no folds anywhere in the document), then, even after
 * computing the candidate move, a second bail-out if it turns out no
 * range actually needed redirecting. Declining hands the keypress back
 * to `@codemirror/commands`' own `cursorCharLeft`/`cursorCharRight`
 * (still bound, lower precedence, via `defaultKeymap`) to run completely
 * unmodified — so every non-fold-adjacent arrow press (the vast
 * majority) is pixel-identical to before this file existed, never a
 * parallel reimplementation that could subtly drift from upstream's own
 * bidi/goal-column/multi-cursor handling.
 */

/**
 * The exact same point-containment test `@codemirror/language`'s own
 * private `clearTouchedFolds` uses (`a < pos && b > pos` — strictly
 * inside, exclusive of both boundaries) confirmed against the installed
 * `@codemirror/language@6.12.4` source. Landing exactly *at* a fold's
 * own `from`/`to` is not "inside" it by this same definition either
 * there or here — both files agree a boundary position is a legitimate
 * place for the caret to rest without side effects.
 */
function enclosingFold(state: EditorState, pos: number): { from: number; to: number } | null {
  let found: { from: number; to: number } | null = null;
  foldedRanges(state).between(pos, pos, (from, to) => {
    if (from < pos && to > pos) {
      found = { from, to };
    }
  });
  return found;
}

/** `@codemirror/commands`' own private `rangeEnd` — a non-empty selection collapses to one end on a plain (non-extending) arrow press, never steps further; confirmed against the installed `@codemirror/commands@6.11.0` source (`cursorByChar`'s own `range.empty ? view.moveByChar(...) : rangeEnd(...)` branch) so this file's fold-skip logic sees the exact same starting point that command already would. */
function rangeEnd(range: SelectionRange, forward: boolean): SelectionRange {
  return EditorSelection.cursor(forward ? range.to : range.from);
}

/**
 * `@codemirror/commands`' own private `ltrAtCursor` — resolves which
 * document direction "left"/"right" actually means at the main
 * selection's own head, so `ArrowLeft`/`ArrowRight` stay bidi-correct
 * (backward in LTR text, forward in RTL text, matching `cursorCharLeft`/
 * `cursorCharRight`'s own documented contract) rather than this file
 * silently hardcoding an LTR assumption the rest of the editor doesn't
 * make.
 */
function ltrAtCursor(view: EditorView): boolean {
  return view.textDirectionAt(view.state.selection.main.head) === Direction.LTR;
}

function cursorByCharNeverEnteringFolds(view: EditorView, forward: boolean): boolean {
  const state = view.state;
  if (foldedRanges(state).size === 0) {
    return false;
  }

  let touchedFold = false;
  const newRanges = state.selection.ranges.map((range) => {
    let cur = range.empty ? view.moveByChar(range, forward) : rangeEnd(range, forward);
    // A chain of directly-adjacent folds (rare, but not impossible — e.g.
    // two immediately-consecutive single-line fenced code blocks, each
    // fully folded) is skipped in one keypress too, not one press per
    // fold — matching "skip over the folded range" for the *whole*
    // contiguous hidden run the same single motion would otherwise have
    // stepped into piecemeal. Bounded, not `for (;;)`, as a defensive
    // measure against a pathological/cyclic fold-range configuration
    // this file has no reason to assume can't exist.
    for (let guard = 0; guard < 50; guard++) {
      const fold = enclosingFold(state, cur.head);
      if (!fold) {
        break;
      }
      touchedFold = true;
      cur = EditorSelection.cursor(forward ? fold.to : fold.from);
    }
    return cur;
  });

  if (!touchedFold) {
    return false;
  }

  const newSelection = EditorSelection.create(newRanges, state.selection.mainIndex);
  if (newSelection.eq(state.selection, true)) {
    return false;
  }

  view.dispatch(state.update({ selection: newSelection, scrollIntoView: true, userEvent: 'select' }));
  return true;
}

const foldAwareCursorLeft: Command = (view) => cursorByCharNeverEnteringFolds(view, !ltrAtCursor(view));
const foldAwareCursorRight: Command = (view) => cursorByCharNeverEnteringFolds(view, ltrAtCursor(view));

export const foldAwareArrowKeymap: readonly KeyBinding[] = [
  { key: 'ArrowLeft', run: foldAwareCursorLeft },
  { key: 'ArrowRight', run: foldAwareCursorRight },
];
