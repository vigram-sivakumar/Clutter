import { foldEffect, foldedRanges, unfoldEffect } from '@codemirror/language';
import type { Command, KeyBinding } from '@codemirror/view';

import { findFold, getFoldRange } from './foldSemantics';

/**
 * Clutter's own replacements for `@codemirror/language`'s `foldCode`/
 * `unfoldCode`/`foldAll` — bound at higher keymap precedence than
 * `foldKeymap` (`createEditorView.ts`) so these run *instead of* the
 * native commands, never alongside them. Each one is a thin wrapper: find
 * the line(s) in scope, then ask `foldSemantics.ts` — never
 * `@codemirror/language`'s own `foldable()` — what's foldable there.
 *
 * **Why this exists**: `foldCode`/`foldAll`'s own native implementations
 * call `foldable()` directly, which consults every registered
 * `foldService` and then falls back to the generic native `foldNodeProp`
 * answer the instant every service declines. `listItemFoldService.ts`'s
 * registered service correctly declines (`null`) for a list item with no
 * genuine descendant — but that `null` only means "try the next one," not
 * "there is definitively nothing here," so the native fallback still
 * fires and still returns the old, lazy-continuation-corrupted
 * `ListItem`/`Task` boundary. Confirmed directly: dispatching the native
 * `foldable()` query for `- [ ] Parent\nSibling paragraph` (no genuine
 * child) returned a real, non-null range covering `Sibling paragraph`,
 * even with `listItemFoldService()` registered. The inline toggle
 * (`foldToggleDecoration.ts`) was never exposed to this, because it never
 * called `foldable()` generically in the first place — it always called
 * the shared range-computation function directly. This module gives
 * Clutter's own keyboard shortcuts (`Ctrl-Shift-[`/`Cmd-Alt-[`,
 * `Ctrl-Shift-]`/`Cmd-Alt-]`, `Ctrl-Alt-[`, `Ctrl-Alt-]`) that exact same
 * property, closing the last entry point that could still reach the
 * native fallback for a construct `foldSemantics.ts` overrides.
 *
 * `unfoldCode`/`unfoldAll`'s own logic never touches `foldable()` at all
 * (they only ever read *existing* fold state via `findFold`/the fold
 * field directly) — reimplemented here anyway, using `foldSemantics.ts`'s
 * own `findFold`, purely so this file is the one place all four commands
 * live, rather than mixing "two reimplemented, two left as the native
 * import." No behavior difference from native `unfoldCode`/`unfoldAll`
 * for these two.
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
