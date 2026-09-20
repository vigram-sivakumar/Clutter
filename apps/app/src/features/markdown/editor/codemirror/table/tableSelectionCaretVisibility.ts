import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { tableSelectionField } from './tableSelection';

/**
 * Hides the root editor's own visual caret while a `TableSelection`
 * (row/column/range, `tableSelection.ts`) is active — a table, not a
 * Markdown line, is the currently-selected object in that state, so a
 * blinking caret sitting on whatever line the root's own `state.selection`
 * happens to occupy would misleadingly suggest that line is the current
 * editing target. Deliberately does **not** move, replace, or blur
 * anything: `state.selection` is left exactly where it is, and the root
 * view stays genuinely focused (required for `tableSelectionClearKeymap()`,
 * `tableSelectionClear.ts`, to keep receiving Backspace/Delete via its own
 * already-installed keymap — see this file's own investigation record for
 * why blurring root instead would break that routing).
 *
 * **Mechanism — an existing CM6 primitive, not a patch on it.**
 * `createEditorView.ts` installs `drawSelection()` for the root editor's
 * caret (the native browser caret is deliberately disabled there — a
 * WKWebView stale-caret bug, per that file's own comment). Reading the
 * installed `@codemirror/view` source directly: `drawSelection()`'s own
 * base theme already sets `.cm-cursorLayer { display: none }` and only
 * overrides that to `display: block` under `&.cm-focused > .cm-scroller >
 * .cm-cursorLayer` — i.e. CM6 itself already gates the whole cursor layer
 * on a `.cm-focused` class toggle. This extension adds exactly one more
 * class, `cm-table-selection-active`, to that same `.cm-editor` element
 * whenever `tableSelectionField` is non-null; the accompanying CSS rule
 * (`MarkdownEditor.css`) is a *more specific* selector requiring both
 * classes, so it overrides CM6's own focused-mode rule without touching
 * `drawSelection()` or any CM6 internal.
 *
 * `EditorView.updateListener` — the same primitive
 * `tableActiveCellReconciliation()` (`tableActiveCellController.ts`) already
 * uses for an analogous "sync a DOM/view-level side effect from state on
 * every update" concern — not a new mechanism. Runs on every update rather
 * than only when `tableSelectionField` changed: a single `classList.toggle`
 * call is cheap enough that gating it on a finer-grained check would add
 * complexity (diffing old vs. new field value) for no measurable benefit.
 */
const TABLE_SELECTION_ACTIVE_CLASS = 'cm-table-selection-active';

export function tableSelectionCaretVisibility(): Extension {
  return EditorView.updateListener.of((update) => {
    const active = (update.state.field(tableSelectionField, false) ?? null) !== null;
    update.view.dom.classList.toggle(TABLE_SELECTION_ACTIVE_CLASS, active);
  });
}
