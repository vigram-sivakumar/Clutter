import { redo, undo } from '@codemirror/commands';
import { Annotation, StateEffect, type ChangeSpec, type Extension, type Transaction } from '@codemirror/state';
import { EditorView, keymap, type ViewUpdate } from '@codemirror/view';

import { createEditorView } from '../createEditorView';
import { resolveLogicalCell } from './tableGeometry';

/**
 * Tags a root transaction as forwarded from the active cell's own nested
 * editor — lets `reconcileNestedFromRoot` (below) tell "this change came
 * from me" apart from "the document changed some other way" (undo/redo,
 * an edit made elsewhere while this cell is active), without needing a
 * second, independent bookkeeping mechanism.
 */
export const tableCellForward = Annotation.define<boolean>();

/**
 * Tags a nested-editor transaction as the controller's own content reset
 * (a cell switch's full-document replace, or `reconcileNestedFromRoot`'s
 * resync) — `forwardToRoot` must never forward one of these back onto the
 * root: it isn't a user edit, and forwarding it would try to overwrite the
 * root's own text a second time at the (by then already-updated) anchor,
 * corrupting whatever the root actually holds rather than syncing to it.
 */
const cellContentReset = Annotation.define<boolean>();

/**
 * Dispatched on the root view at the end of `activate()` — a pure
 * activation change (click, Tab/Shift-Tab, Arrow) carries no document
 * change of its own, so without this marker `tableWidgetField`'s
 * `StateField.update()` (which only rebuilds `if (tr.docChanged)`, M1)
 * would never see that a different cell is now active and would keep
 * rendering the nested editor mounted in the *previous* cell's `<td>`
 * (M5, docs/table-implementation-plan.md). Same "changeless marker
 * effect signals a StateField to rebuild" pattern `imageUiState.ts`'s own
 * `presentationOnlyEdit`/`setImageUiState` already establish — not a new
 * mechanism.
 */
export const tableActiveCellChanged = StateEffect.define<null>();

export interface CellRange {
  readonly from: number;
  readonly to: number;
}

/**
 * Owns the single reusable nested `EditorView` for a table's active cell
 * (Architecture E, ADR-034 — docs/table-implementation-plan.md, M2). One
 * instance per root `EditorView` (§D) — this class holds no module-level
 * state, so that scoping is entirely the caller's to establish (not yet
 * done — this milestone doesn't wire a controller into
 * `MarkdownEditor.tsx`/`buildEditorExtensions.ts`).
 *
 * Not yet wired into the live editing path (`buildEditorExtensions.ts`/
 * `MarkdownEditor.tsx` — M5). Exercised only by this file's own tests and
 * `tableCellNavigation.test.ts`'s (M4), the same "direct unit tests
 * against a test `EditorView`" style the ADR-034 prototype itself was
 * verified with — no click handler reaches this yet.
 */
export class TableActiveCellController {
  private nestedViewInstance: EditorView | null = null;
  private anchor: CellRange | null = null;
  private forwarding = false;
  private nestedExtensions: readonly Extension[] = [];

  /**
   * Extra extensions installed on the nested `EditorView` the next time it
   * is lazily created — the seam `tableCellNavigation()` (M4,
   * docs/table-implementation-plan.md) hooks into, since a navigation
   * keymap needs a reference to this same controller instance, which
   * doesn't exist yet at this controller's own construction time. A
   * setter rather than a constructor parameter for exactly that reason;
   * a no-op once the nested view already exists (call before the first
   * `activate()`).
   */
  setNestedExtensions(extensions: readonly Extension[]): void {
    this.nestedExtensions = extensions;
  }

  /** The one reusable nested `EditorView`, once at least one cell has been activated — `null` before that. */
  get nestedView(): EditorView | null {
    return this.nestedViewInstance;
  }

  /** The active cell's current root-document range, kept in sync by `remapActiveAnchor` — `null` when no cell is active. */
  get activeAnchor(): CellRange | null {
    return this.anchor;
  }

  /**
   * Activates the cell `[from, to)` of `rootView`'s current document,
   * mounting the nested editor (created lazily on first call, reused on
   * every subsequent one — verified by this file's own instance-creation
   * counter test) into `container`, caret at `cursorPos` (an absolute
   * root-document position, clamped into the cell).
   *
   * `from`/`to` must always be resolved fresh from current root state at
   * call time, never a range cached from an earlier click/render — this
   * is what a caller must do to avoid ADR-034's own "stale click-handler
   * closures" bug (a widget's inactive-cell click handler that closed
   * over a range captured at widget-build time mounted the wrong,
   * offset substring after an earlier edit shifted positions). This
   * method itself has no cache to go stale from — every call re-derives
   * the cell's text straight from `rootView.state`.
   */
  activate(rootView: EditorView, container: HTMLElement, from: number, to: number, cursorPos: number): void {
    const text = rootView.state.sliceDoc(from, to);
    const caret = Math.max(0, Math.min(cursorPos - from, text.length));
    // Set before any dispatch below — forwardToRoot (fired synchronously
    // by the reset dispatch's own updateListener) must see this cell's
    // anchor, not a stale one left over from whichever cell was active
    // before (harmless here since the reset dispatch is tagged and never
    // forwarded anyway, but keeping anchor/dispatch order correct avoids
    // relying on that guard alone).
    this.anchor = { from, to };

    if (!this.nestedViewInstance) {
      this.nestedViewInstance = createEditorView({
        doc: text,
        parent: container,
        enableHistory: false,
        extensions: [
          keymap.of([
            {
              key: 'Mod-z',
              run: () => {
                undo(rootView);
                return true;
              },
            },
            {
              key: 'Mod-y',
              mac: 'Mod-Shift-z',
              run: () => {
                redo(rootView);
                return true;
              },
            },
          ]),
          EditorView.updateListener.of((update) => this.forwardToRoot(rootView, update)),
          ...this.nestedExtensions,
        ],
      });
      this.nestedViewInstance.dispatch({ selection: { anchor: caret } });
    } else {
      if (this.nestedViewInstance.dom.parentElement !== container) {
        container.appendChild(this.nestedViewInstance.dom);
      }
      this.nestedViewInstance.dispatch({
        changes: { from: 0, to: this.nestedViewInstance.state.doc.length, insert: text },
        selection: { anchor: caret },
        annotations: [cellContentReset.of(true)],
      });
    }

    // Tells tableWidgetField's StateField to rebuild even though nothing
    // in rootView's own document changed — see tableActiveCellChanged's
    // own doc comment. A no-op transaction (no changes, not added to
    // history) wherever tableWidgetField isn't installed (every M1–M4
    // test `EditorView` above included).
    rootView.dispatch({ effects: tableActiveCellChanged.of(null) });
  }

  /**
   * Un-mounts the nested editor's DOM without destroying it — the same
   * instance is reused on the next `activate()` (§D/§A's "one reusable
   * `EditorView`", not a fresh instance per cell switch).
   */
  deactivate(): void {
    this.nestedViewInstance?.dom.remove();
    this.anchor = null;
  }

  private forwardToRoot(rootView: EditorView, update: ViewUpdate): void {
    if (!update.docChanged || !this.anchor || this.forwarding) {
      return;
    }
    if (update.transactions.some((tr) => tr.annotation(cellContentReset))) {
      return;
    }
    const offset = this.anchor.from;
    const changes: ChangeSpec[] = [];
    update.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
      changes.push({ from: fromA + offset, to: toA + offset, insert: inserted.toString() });
    });
    if (changes.length === 0) {
      return;
    }
    this.forwarding = true;
    try {
      rootView.dispatch({ changes, annotations: [tableCellForward.of(true)] });
    } finally {
      this.forwarding = false;
    }
  }

  /**
   * Remaps the tracked active-cell anchor through a root transaction.
   * **Must be called synchronously from `tableWidgetField`'s own
   * `StateField.update()`, before it rebuilds decorations for the same
   * transaction** — never from an `EditorView.updateListener`. This is
   * ADR-034's own "StateField/updateListener ordering hazard" fix: a
   * `StateField.update()` runs synchronously during transaction
   * application, before any `updateListener` fires for that same
   * transaction, so position tracking a `StateField`'s own decoration
   * output depends on must live at that same synchronous layer — the
   * prototype's own reproduction was a structural row-insert that,
   * remapped only from an `updateListener`, mounted the editor into the
   * wrong (newly inserted) row.
   *
   * **Structural-change safety (M3, docs/table-implementation-plan.md):**
   * a plain `ChangeSet.mapPos` remap is correct for an ordinary edit
   * anywhere else in the document (including a row inserted above/below
   * this cell — mapPos already shifts the anchor correctly, same as any
   * other text insertion), but is not enough on its own when the edit
   * removes the structure the anchor depends on — the active row deleted
   * entirely, or the active cell's whole table deleted. In both cases the
   * naive mapped position can land inside a *different*, structurally
   * unrelated cell that merely happens to now occupy that offset —
   * exactly the "silent mis-association" bug class ADR-034 warns is
   * systemic, not a one-off. Guarded here by re-resolving the mapped
   * position through `resolveLogicalCell` (`tableGeometry.ts`, retained/
   * rendering-mechanism-agnostic by design): if the position no longer
   * resolves into *any* table cell at all, the structure is gone and this
   * deactivates cleanly rather than risk mounting into the wrong one. A
   * cell whose own *content* was cleared (e.g. select-all-and-delete
   * inside it) still resolves here — its row/table nodes are untouched,
   * only the interior text changed — so this never deactivates a merely-
   * emptied cell.
   */
  remapActiveAnchor(tr: Transaction): void {
    if (!this.anchor || !tr.docChanged) {
      return;
    }
    const from = tr.changes.mapPos(this.anchor.from, -1);
    const to = tr.changes.mapPos(this.anchor.to, 1);

    if (!resolveLogicalCell(tr.state, from)) {
      this.deactivate();
      return;
    }

    this.anchor = { from, to };
  }

  /**
   * Re-syncs the nested editor's document from root state, for a root
   * change that did **not** originate from this controller's own
   * `forwardToRoot` — undo/redo, or an edit made elsewhere while this
   * cell is active. Safe to call from an `updateListener` (§C) — unlike
   * `remapActiveAnchor`, nothing here gates decoration correctness, only
   * keeps the nested editor's own content from drifting out of sync.
   */
  reconcileNestedFromRoot(rootView: EditorView): void {
    if (!this.nestedViewInstance || !this.anchor) {
      return;
    }
    const expected = rootView.state.sliceDoc(this.anchor.from, this.anchor.to);
    if (this.nestedViewInstance.state.doc.toString() === expected) {
      return;
    }
    this.nestedViewInstance.dispatch({
      changes: { from: 0, to: this.nestedViewInstance.state.doc.length, insert: expected },
      annotations: [cellContentReset.of(true)],
    });
  }

  /** Root editor unmount cleanup (§13) — destroys the nested view for good, unlike `deactivate()`. Wired from `MarkdownEditor.tsx`'s own unmount cleanup (M5). */
  destroy(): void {
    this.nestedViewInstance?.destroy();
    this.nestedViewInstance = null;
    this.anchor = null;
  }
}

/**
 * Root-view `updateListener` extension that calls
 * `controller.reconcileNestedFromRoot()` after every doc-changing root
 * transaction that did **not** originate from this same controller's own
 * `forwardToRoot` (§C, M5, docs/table-implementation-plan.md) — physical
 * `Ctrl+Z`/`Ctrl+Shift+Z` (via the nested editor's own Mod-z/Mod-y keymap
 * calling `undo(rootView)`/`redo(rootView)` directly), or any other edit
 * made elsewhere while this cell is active. `reconcileNestedFromRoot`
 * itself is safe to call from an `updateListener` (unlike
 * `remapActiveAnchor`, which must run synchronously inside the
 * `StateField`'s own `update()` — see that method's own doc comment) —
 * this is deliberately a *separate* extension from `tableWidgetDecoration`,
 * not folded into it, since a `StateField.update()` must stay a pure
 * function with no transaction dispatches of its own, which
 * `reconcileNestedFromRoot`'s nested-view dispatch would violate if called
 * from there.
 */
export function tableActiveCellReconciliation(controller: TableActiveCellController): Extension {
  return EditorView.updateListener.of((update) => {
    if (!update.docChanged) {
      return;
    }
    if (update.transactions.some((tr) => tr.annotation(tableCellForward))) {
      return;
    }
    controller.reconcileNestedFromRoot(update.view);
  });
}
