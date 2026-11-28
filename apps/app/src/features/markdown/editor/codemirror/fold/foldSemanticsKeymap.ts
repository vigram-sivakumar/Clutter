import { foldEffect, foldedRanges, unfoldEffect } from '@codemirror/language';
import type { Command, KeyBinding } from '@codemirror/view';

import { findFold, getFoldRange } from './foldSemantics';

/** Clutter's fold commands share the positive eligibility policy in
 * foldSemantics.ts. Native foldCode/foldAll call foldable() directly and
 * would fall back to generic Markdown paragraph/list folds. Native CM6
 * effects and fold state remain the sole mechanism for actual folding.
 */

function currentLine(view: Parameters<Command>[0]) {
  return view.state.doc.lineAt(view.state.selection.main.head);
}

/** Fold the current line's own owned range, per `foldSemantics.ts` — mirrors native `foldCode`'s single-line-at-cursor behavior (this codebase's own toggle never needed multi-selection support, so neither does this). */
const foldAtCursor: Command = (view) => {
  const line = currentLine(view);
  const range = getFoldRange(view.state, line);
  if (!range) {
    return false;
  }
  view.dispatch({ effects: foldEffect.of(range) });
  return true;
};

/** Unfold whatever fold currently covers the cursor's own line, if any. */
const unfoldAtCursor: Command = (view) => {
  const line = currentLine(view);
  const folded = findFold(view.state, line.from, line.to);
  if (!folded) {
    return false;
  }
  view.dispatch({ effects: unfoldEffect.of(folded) });
  return true;
};

/**
 * Fold every top-level foldable range in the document — mirrors native
 * `foldAll`'s own "walk forward, fold, skip past what was just folded"
 * shape, but every range comes from `getFoldRange` (`foldSemantics.ts`),
 * never `foldable()`.
 */
const foldEverything: Command = (view) => {
  const { state } = view;
  const effects = [];
  let lineNumber = 1;
  while (lineNumber <= state.doc.lines) {
    const line = state.doc.line(lineNumber);
    const range = getFoldRange(state, line);
    if (range) {
      effects.push(foldEffect.of(range));
      lineNumber = state.doc.lineAt(Math.min(range.to, state.doc.length)).number + 1;
    } else {
      lineNumber += 1;
    }
  }
  if (effects.length === 0) {
    return false;
  }
  view.dispatch({ effects });
  return true;
};

/** Unfold every currently-folded range — identical to native `unfoldAll`, reimplemented here only so all four commands live in one file (see this module's own top doc comment). */
const unfoldEverything: Command = (view) => {
  const effects: Array<ReturnType<typeof unfoldEffect.of>> = [];
  foldedRanges(view.state).between(0, view.state.doc.length, (from, to) => {
    effects.push(unfoldEffect.of({ from, to }));
  });
  if (effects.length === 0) {
    return false;
  }
  view.dispatch({ effects });
  return true;
};

export const foldSemanticsKeymap: readonly KeyBinding[] = [
  { key: 'Ctrl-Shift-[', mac: 'Cmd-Alt-[', run: foldAtCursor },
  { key: 'Ctrl-Shift-]', mac: 'Cmd-Alt-]', run: unfoldAtCursor },
  { key: 'Ctrl-Alt-[', run: foldEverything },
  { key: 'Ctrl-Alt-]', run: unfoldEverything },
];
