// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorState, StateEffect } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { history, redo, undo } from '@codemirror/commands';

import { markdownLanguageExtension } from '../markdownLanguage';
import { getRootSelectionCollapse, TableActiveCellController } from './tableActiveCellController';

const mountedViews: EditorView[] = [];

afterEach(() => {
  for (const view of mountedViews.splice(0)) {
    view.destroy();
  }
});

/** Includes `history()` — root CM6 owns undo/redo (§A); the nested editor never does (`enableHistory: false`). */
function mountRootView(doc: string): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({
    state: EditorState.create({ doc, extensions: [markdownLanguageExtension(), history()] }),
    parent,
  });
  mountedViews.push(view);
  return view;
}

function makeContainer(): HTMLElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return container;
}

describe('TableActiveCellController — click-activate', () => {
  it('mounts a nested editor into the container, with the cell\'s own text and caret placed at the clicked position', () => {
    const root = mountRootView('| a | bold |\n| - | - |');
    const controller = new TableActiveCellController();
    const container = makeContainer();

    controller.activate(root, container, 6, 10, 8); // "bold", caret after "bo"

    expect(controller.nestedView).not.toBeNull();
    expect(controller.nestedView!.state.doc.toString()).toBe('bold');
    expect(controller.nestedView!.state.selection.main.head).toBe(2);
    expect(container.contains(controller.nestedView!.dom)).toBe(true);
  });

  it('re-resolves the cell range fresh at activation time, not from a stale earlier capture (ADR-034: stale click-handler closures)', () => {
    const root = mountRootView('| a | b |\n| - | - |');
    const controller = new TableActiveCellController();
    const container = makeContainer();

    // Shift every later position by inserting text at the very start.
    root.dispatch({ changes: { from: 0, to: 0, insert: 'XX' } });
    const shiftedFrom = 6 + 2;
    const shiftedTo = 7 + 2;

    controller.activate(root, container, shiftedFrom, shiftedTo, shiftedFrom);

    expect(controller.nestedView!.state.doc.toString()).toBe('b');
  });
});

describe('getRootSelectionCollapse', () => {
  it('returns {} when the root selection is already empty', () => {
    const root = mountRootView('hello world');
    root.dispatch({ selection: { anchor: 3 } });

    expect(getRootSelectionCollapse(root)).toEqual({});
  });

  it('returns a selection collapsing to the current head when non-empty', () => {
    const root = mountRootView('hello world');
    root.dispatch({ selection: { anchor: 2, head: 8 } });

    expect(getRootSelectionCollapse(root)).toEqual({ selection: { anchor: 8 } });
  });
});

describe('TableActiveCellController — root selection reconciliation (2026-09-27)', () => {
  /**
   * Regression coverage for the table-selection state milestone: none of
   * `activate()`'s own root-view dispatches ever included a `selection`
   * field before this — a stale non-empty root selection (text selected
   * elsewhere in the document) survived cell activation untouched, then
   * kept rendering underneath whatever the table did next. `activate()`
   * is the single method every cell-activation path funnels through
   * (mouse click, `TableWidget.buildRow`'s inactive-cell handler, and
   * every keyboard-driven caller — `tableCellNavigation.ts`,
   * `tableBoundaryNavigation.ts`, `tableRangeSelectionTyping.ts`) — one
   * fix here covers all of them; these tests exercise `activate()`
   * directly, both with and without a `sourceEvent` (mouse vs. keyboard
   * activation), rather than duplicating the fix's own reasoning per
   * caller.
   */
  it('mouse activation (a sourceEvent is passed) collapses a stale non-empty root selection', () => {
    const root = mountRootView('| a | bold |\n| - | - |');
    root.dispatch({ selection: { anchor: 0, head: root.state.doc.length } });
    const controller = new TableActiveCellController();
    const container = makeContainer();

    controller.activate(root, container, 6, 10, 8, new MouseEvent('mousedown', { button: 0, detail: 1 }));

    expect(root.state.selection.main.empty).toBe(true);
  });

  it('keyboard activation (no sourceEvent) collapses a stale non-empty root selection just the same', () => {
    const root = mountRootView('| a | bold |\n| - | - |');
    root.dispatch({ selection: { anchor: 0, head: root.state.doc.length } });
    const controller = new TableActiveCellController();
    const container = makeContainer();

    controller.activate(root, container, 6, 10, 8); // tableCellNavigation.ts/tableBoundaryNavigation.ts's own shape — no event

    expect(root.state.selection.main.empty).toBe(true);
  });

  it('folds the collapse into the same dispatch as tableActiveCellChanged — never a second transaction', () => {
    const root = mountRootView('| a | bold |\n| - | - |');
    root.dispatch({ selection: { anchor: 0, head: root.state.doc.length } });
    const controller = new TableActiveCellController();
    const container = makeContainer();
    const dispatchSpy = vi.spyOn(root, 'dispatch');

    controller.activate(root, container, 6, 10, 8);

    const dispatchesWithSelection = dispatchSpy.mock.calls.filter((args) => {
      const spec = args[0];
      return !Array.isArray(spec) && !!spec && typeof spec === 'object' && 'selection' in spec;
    });
    expect(dispatchesWithSelection).toHaveLength(1);
    expect((dispatchesWithSelection[0]![0] as { effects?: unknown }).effects).toBeDefined();
  });

  it('does not dispatch a selection field at all when the root selection is already empty', () => {
    const root = mountRootView('| a | bold |\n| - | - |');
    expect(root.state.selection.main.empty).toBe(true);
    const controller = new TableActiveCellController();
    const container = makeContainer();
    const dispatchSpy = vi.spyOn(root, 'dispatch');

    controller.activate(root, container, 6, 10, 8);

    const dispatchesWithSelection = dispatchSpy.mock.calls.filter((args) => {
      const spec = args[0];
      return !Array.isArray(spec) && !!spec && typeof spec === 'object' && 'selection' in spec;
    });
    expect(dispatchesWithSelection).toHaveLength(0);
  });

  it('never touches the nested view\'s own selection — only root\'s', () => {
    const root = mountRootView('| a | bold text |\n| - | - |');
    root.dispatch({ selection: { anchor: 0, head: root.state.doc.length } });
    const controller = new TableActiveCellController();
    const container = makeContainer();

    controller.activate(root, container, 6, 15, 9); // "bold text", cursorPos 9 -> local caret 3

    // The nested view's own caret placement is entirely `cursorPos`'s (and,
    // when a sourceEvent is given, the forwarded mousedown's) concern —
    // unaffected by root's own selection ever being collapsed alongside it.
    expect(controller.nestedView!.state.doc.toString()).toBe('bold text');
    expect(controller.nestedView!.state.selection.main.head).toBe(3);
  });

  it('a real Ctrl+A-style root selection with no table interaction at all is left completely untouched', () => {
    const root = mountRootView('| a | bold |\n| - | - |\nplain text');
    root.dispatch({ selection: { anchor: 0, head: root.state.doc.length } });
    const before = root.state.selection.main;

    // No table interaction happens in this test at all — asserting the
    // fix is genuinely scoped to the moment a table interaction takes
    // ownership, not something that runs unconditionally.
    expect(root.state.selection.main.from).toBe(before.from);
    expect(root.state.selection.main.to).toBe(before.to);
    expect(root.state.selection.main.empty).toBe(false);
  });
});

describe('TableActiveCellController — sourceEvent forwarding (2026-09-27: replaces the old clickCoords refinement)', () => {
  /**
   * jsdom has no real layout engine, so CM6's own click-to-position
   * resolution can't be exercised end to end here (the same limitation
   * `tableSelection.test.ts`'s own `mockPosAtCoords` already documents) —
   * `basicMouseSelection` (`@codemirror/view`, `handlers.mousedown`) calls
   * `view.posAndSideAtCoords(coords, false)`, not `posAtCoords`, so that's
   * the method mocked here, at the `EditorView.prototype` level (not a
   * specific instance) since `activate()` creates the nested `EditorView`
   * lazily, internally — there's no instance to spy on until the call
   * under test has already run.
   */
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function makeMousedown(overrides: Partial<MouseEvent> = {}): MouseEvent {
    return new MouseEvent('mousedown', {
      clientX: 42,
      clientY: 7,
      button: 0,
      detail: 1,
      bubbles: true,
      cancelable: true,
      ...overrides,
    });
  }

  it('forwards a real mousedown to the nested contentDOM, and CM6 places the caret at the resolved position, overriding cursorPos\'s own coarser placement', () => {
    const root = mountRootView('| a | bold text |\n| - | - |');
    const controller = new TableActiveCellController();
    const container = makeContainer();
    vi.spyOn(EditorView.prototype, 'posAndSideAtCoords').mockReturnValue({ pos: 2, assoc: 1 });

    // cursorPos (`to`, end of "bold text" = 9) would place the caret at 9
    // absent forwarding — CM6's own resolution of the forwarded event must
    // win.
    controller.activate(root, container, 6, 15, 15, makeMousedown());

    expect(controller.nestedView!.state.selection.main.head).toBe(2);
  });

  it('never dispatches a forwarded mousedown when sourceEvent is omitted (every keyboard-driven activation) — cursorPos\'s own placement stands', () => {
    const root = mountRootView('| a | bold |\n| - | - |');
    const controller = new TableActiveCellController();
    const container = makeContainer();
    controller.activate(root, container, 6, 10, 8); // cursorPos 8 -> caret 2 within "bold"

    const dispatchSpy = vi.spyOn(controller.nestedView!.contentDOM, 'dispatchEvent');
    // A second, keyboard-style activation (still no sourceEvent) on the
    // same already-mounted nested view — must not forward anything either.
    controller.activate(root, container, 6, 10, 9);

    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(controller.nestedView!.state.selection.main.head).toBe(3);
  });

  it('forwards on a cell switch (reusing the already-mounted nested editor), not just first activation', () => {
    const root = mountRootView('| a | bold | more |\n| - | - | - |');
    const controller = new TableActiveCellController();
    const container = makeContainer();
    controller.activate(root, container, 6, 10, 10); // activate "bold" first (no event)
    vi.spyOn(EditorView.prototype, 'posAndSideAtCoords').mockReturnValue({ pos: 3, assoc: 1 });

    controller.activate(root, container, 13, 17, 17, makeMousedown({ clientX: 11, clientY: 22 })); // switch to "more"

    expect(controller.nestedView!.state.doc.toString()).toBe('more');
    expect(controller.nestedView!.state.selection.main.head).toBe(3);
  });

  it('forwards clientX/clientY, button, detail, shiftKey, ctrlKey, metaKey, and altKey unchanged, and always forces button 0', () => {
    const root = mountRootView('| a | bold |\n| - | - |');
    const controller = new TableActiveCellController();
    const container = makeContainer();
    controller.activate(root, container, 6, 10, 10); // mount first, uneventfully
    const captured: MouseEvent[] = [];
    controller.nestedView!.contentDOM.addEventListener('mousedown', (e) => captured.push(e as MouseEvent));

    controller.activate(
      root,
      container,
      6,
      10,
      10,
      makeMousedown({ clientX: 123, clientY: 456, button: 0, detail: 1, shiftKey: true, ctrlKey: true, metaKey: true, altKey: true })
    );

    expect(captured).toHaveLength(1);
    const forwarded = captured[0]!;
    expect(forwarded.clientX).toBe(123);
    expect(forwarded.clientY).toBe(456);
    expect(forwarded.button).toBe(0);
    expect(forwarded.detail).toBe(1);
    expect(forwarded.shiftKey).toBe(true);
    expect(forwarded.ctrlKey).toBe(true);
    expect(forwarded.metaKey).toBe(true);
    expect(forwarded.altKey).toBe(true);
  });

  it('the forwarded mousedown does not bubble — document never observes it', () => {
    const root = mountRootView('| a | bold |\n| - | - |');
    const controller = new TableActiveCellController();
    const container = makeContainer();
    const documentSpy = vi.fn();
    document.addEventListener('mousedown', documentSpy);

    controller.activate(root, container, 6, 10, 10, makeMousedown());

    expect(documentSpy).not.toHaveBeenCalled();
    document.removeEventListener('mousedown', documentSpy);
  });

  it('produces exactly one CM6-owned (select.pointer) selection transaction from the forwarded gesture — no separate manual coordinate-refinement dispatch racing it', () => {
    const root = mountRootView('| a | bold text |\n| - | - |');
    const controller = new TableActiveCellController();
    const container = makeContainer();
    vi.spyOn(EditorView.prototype, 'posAndSideAtCoords').mockReturnValue({ pos: 2, assoc: 1 });
    controller.activate(root, container, 6, 15, 15); // mount first, uneventfully
    // Counts every `select.pointer`-tagged transaction — CM6's own tag for
    // exactly the kind of dispatch `basicMouseSelection` produces — from
    // this point on, so the initial (unrelated) mount dispatch above isn't
    // counted.
    let pointerCount = 0;
    const countingExt = EditorView.updateListener.of((u) => {
      pointerCount += u.transactions.filter((tr) => tr.isUserEvent('select.pointer')).length;
    });
    controller.nestedView!.dispatch({ effects: StateEffect.appendConfig.of(countingExt) });

    controller.activate(root, container, 6, 15, 15, makeMousedown());

    expect(pointerCount).toBe(1);
  });
});

describe('TableActiveCellController — type-and-forward', () => {
  it('forwards a nested keystroke into the root document, offset by the cell\'s anchor', () => {
    const root = mountRootView('| a | b |\n| - | - |');
    const controller = new TableActiveCellController();
    const container = makeContainer();

    controller.activate(root, container, 6, 7, 7); // "b", caret at end

    controller.nestedView!.dispatch({ changes: { from: 1, to: 1, insert: 'ee' } });

    expect(root.state.doc.toString()).toBe('| a | bee |\n| - | - |');
  });
});

describe('TableActiveCellController — switching cells reuses the one nested editor', () => {
  it('activating A, then B, then A again never creates more than one EditorView instance', () => {
    const root = mountRootView('| a | b | c |\n| - | - | - |');
    const controller = new TableActiveCellController();
    const containerA = makeContainer();
    const containerB = makeContainer();
    const containerC = makeContainer();

    controller.activate(root, containerA, 2, 3, 2); // "a"
    const first = controller.nestedView;
    controller.activate(root, containerB, 6, 7, 6); // "b"
    controller.activate(root, containerC, 10, 11, 10); // "c"
    controller.activate(root, containerA, 2, 3, 2); // back to "a"

    expect(controller.nestedView).toBe(first);
    expect(controller.nestedView!.state.doc.toString()).toBe('a');
    expect(containerA.contains(controller.nestedView!.dom)).toBe(true);
    expect(containerB.contains(controller.nestedView!.dom)).toBe(false);
    expect(containerC.contains(controller.nestedView!.dom)).toBe(false);
  });
});

describe('TableActiveCellController — undo/redo reconciliation', () => {
  it('Mod-z in the nested editor undoes on the root, then reconcileNestedFromRoot syncs the nested doc back', () => {
    const controller = new TableActiveCellController();
    // Wires remapActiveAnchor the way tableWidgetField.update() will in
    // production (§5) — every root transaction, synchronously — since
    // this test drives undo/redo directly rather than through a mounted
    // tableWidgetField.
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const root = new EditorView({
      state: EditorState.create({
        doc: '| a | b |\n| - | - |',
        extensions: [
          markdownLanguageExtension(),
          history(),
          EditorView.updateListener.of((update) => {
            for (const tr of update.transactions) {
              controller.remapActiveAnchor(tr);
            }
          }),
        ],
      }),
      parent,
    });
    mountedViews.push(root);
    const container = makeContainer();

    controller.activate(root, container, 6, 7, 7); // "b"
    controller.nestedView!.dispatch({ changes: { from: 1, to: 1, insert: 'ee' } });
    expect(root.state.doc.toString()).toBe('| a | bee |\n| - | - |');

    undo(root);
    expect(root.state.doc.toString()).toBe('| a | b |\n| - | - |');

    controller.reconcileNestedFromRoot(root);
    expect(controller.nestedView!.state.doc.toString()).toBe('b');

    redo(root);
    controller.reconcileNestedFromRoot(root);
    expect(root.state.doc.toString()).toBe('| a | bee |\n| - | - |');
    expect(controller.nestedView!.state.doc.toString()).toBe('bee');
  });

  it('root has no independent history field left dangling in the nested editor (enableHistory: false)', () => {
    const root = mountRootView('| a | b |\n| - | - |');
    const controller = new TableActiveCellController();
    const container = makeContainer();

    controller.activate(root, container, 6, 7, 7);
    controller.nestedView!.dispatch({ changes: { from: 1, to: 1, insert: 'z' } });

    // undo() on the nested view itself is a structural no-op — no history field installed.
    expect(undo(controller.nestedView!)).toBe(false);
  });
});

describe('TableActiveCellController — empty-cell activation', () => {
  it('activates an empty cell with an empty nested document and caret at 0', () => {
    const root = mountRootView('| a | |\n| - | - |');
    const controller = new TableActiveCellController();
    const container = makeContainer();

    controller.activate(root, container, 6, 6, 6);

    expect(controller.nestedView!.state.doc.toString()).toBe('');
    expect(controller.nestedView!.state.selection.main.head).toBe(0);
  });

  it('typing into a just-activated empty cell forwards correctly into the root document, preserving padding either side', () => {
    // Corrected expectation (was '| a | x|...', the padding-loss bug this
    // controller's own forwardToRoot rewrite fixes): the leading space is
    // never lost, and the gap grows from its 1-space minimum to fit
    // "x" plus a full margin on both sides — see padCellContent.
    const root = mountRootView('| a | |\n| - | - |');
    const controller = new TableActiveCellController();
    const container = makeContainer();

    controller.activate(root, container, 6, 6, 6);
    controller.nestedView!.dispatch({ changes: { from: 0, to: 0, insert: 'x' } });

    expect(root.state.doc.toString()).toBe('| a | x |\n| - | - |');
  });
});

describe('TableActiveCellController — cell padding preservation (source-integrity)', () => {
  // The canonical, header-width-matched shape `tableActivationNormalization.ts`
  // itself now produces (col 1 width 6, matching "Name"; col 2 width 5,
  // matching "Age") — verified against the actual persisted Markdown
  // string after every edit, not rendered HTML.
  const CANONICAL_ROW3 = '|      |     |';
  const TABLE = `| Name | Age |\n| ---- | --- |\n${CANONICAL_ROW3}`;

  it('typing into an empty first cell preserves the table\'s leading/trailing padding', () => {
    const root = mountRootView(TABLE);
    const controller = new TableActiveCellController();
    const container = makeContainer();
    const doc = root.state.doc.toString();
    const row3Start = doc.lastIndexOf(CANONICAL_ROW3);
    const col1Empty = row3Start + 1; // right after row3's own leading "|" — rawFrom for column 1

    controller.activate(root, container, col1Empty, col1Empty, col1Empty);
    controller.nestedView!.dispatch({ changes: { from: 0, to: 0, insert: 'V' } });
    controller.nestedView!.dispatch({ changes: { from: 1, to: 1, insert: 'i' } });

    expect(root.state.doc.toString()).toBe('| Name | Age |\n| ---- | --- |\n| Vi   |     |');
  });

  it('typing into an empty second cell preserves the table\'s leading/trailing padding', () => {
    const root = mountRootView(TABLE);
    const controller = new TableActiveCellController();
    const container = makeContainer();
    const doc = root.state.doc.toString();
    const row3Start = doc.lastIndexOf(CANONICAL_ROW3);
    const col2Empty = doc.indexOf('|', row3Start + 1) + 1; // right after row3's second "|" — rawFrom for column 2

    controller.activate(root, container, col2Empty, col2Empty, col2Empty);
    controller.nestedView!.dispatch({ changes: { from: 0, to: 0, insert: '9' } });

    expect(root.state.doc.toString()).toBe('| Name | Age |\n| ---- | --- |\n|      | 9   |');
  });

  it('editing existing (non-empty) cell content preserves the surrounding padding', () => {
    const filled = '| Name | Age |\n| ---- | --- |\n| Vi   |     |';
    const root = mountRootView(filled);
    const controller = new TableActiveCellController();
    const container = makeContainer();
    const doc = root.state.doc.toString();
    const row3Start = doc.lastIndexOf('| Vi   |     |');
    const contentFrom = row3Start + 2; // "| Vi" — position of "V"

    controller.activate(root, container, contentFrom, contentFrom + 2, contentFrom + 2); // "Vi"
    controller.nestedView!.dispatch({ changes: { from: 2, to: 2, insert: '!' } });

    expect(root.state.doc.toString()).toBe('| Name | Age |\n| ---- | --- |\n| Vi!  |     |');
  });

  it("deleting all of a cell's content leaves it structurally (all-whitespace) padded, not collapsed", () => {
    const filled = '| Name | Age |\n| ---- | --- |\n| Vi   |     |';
    const root = mountRootView(filled);
    const controller = new TableActiveCellController();
    const container = makeContainer();
    const doc = root.state.doc.toString();
    const row3Start = doc.lastIndexOf('| Vi   |     |');
    const contentFrom = row3Start + 2;

    controller.activate(root, container, contentFrom, contentFrom + 2, contentFrom + 2); // "Vi"
    controller.nestedView!.dispatch({ changes: { from: 0, to: 2, insert: '' } });

    expect(root.state.doc.toString()).toBe('| Name | Age |\n| ---- | --- |\n|      |     |');
  });
});

describe('TableActiveCellController — remapActiveAnchor ordering', () => {
  it('remaps the anchor synchronously when called, independent of any updateListener tick (ADR-034: StateField/updateListener ordering hazard)', () => {
    const root = mountRootView('| a | b |\n| - | - |');
    const controller = new TableActiveCellController();
    const container = makeContainer();
    controller.activate(root, container, 6, 7, 6); // "b" at [6,7)

    // A whole extra line inserted before the table (not touching its own
    // header row) — table structure stays intact, so this exercises
    // "ordinary edit elsewhere shifts the anchor," not the M3 structural-
    // loss path (which has its own dedicated tests below).
    const tr = root.state.update({ changes: { from: 0, to: 0, insert: 'XX\n' } });
    controller.remapActiveAnchor(tr);

    expect(controller.activeAnchor).toEqual({ from: 9, to: 10 });
  });

  it('does nothing when no cell is active', () => {
    const root = mountRootView('| a | b |\n| - | - |');
    const controller = new TableActiveCellController();

    const tr = root.state.update({ changes: { from: 0, to: 0, insert: 'XX' } });
    expect(() => controller.remapActiveAnchor(tr)).not.toThrow();
    expect(controller.activeAnchor).toBeNull();
  });
});

describe('TableActiveCellController — structural-change safety (M3)', () => {
  it('a row inserted above the active row correctly re-associates the anchor to the shifted position (still a valid cell)', () => {
    const text = '| a | b |\n| - | - |\n| 1 | 2 |';
    const root = mountRootView(text);
    const controller = new TableActiveCellController();
    const container = makeContainer();
    const cellTwoFrom = text.lastIndexOf('2');
    controller.activate(root, container, cellTwoFrom, cellTwoFrom + 1, cellTwoFrom);

    // Insert a whole new data row right after the alignment row, before
    // the active row — an ordinary structural edit that leaves the table
    // (and the active row itself) fully intact, just shifted.
    const insertPos = text.indexOf('| 1 |');
    const tr = root.state.update({ changes: { from: insertPos, to: insertPos, insert: '| x | y |\n' } });
    controller.remapActiveAnchor(tr);

    expect(controller.activeAnchor).not.toBeNull();
    expect(tr.state.sliceDoc(controller.activeAnchor!.from, controller.activeAnchor!.to)).toBe('2');
  });

  it('deleting the active row entirely deactivates cleanly instead of mounting into a wrong cell', () => {
    const text = '| a | b |\n| - | - |\n| 1 | 2 |';
    const root = mountRootView(text);
    const controller = new TableActiveCellController();
    const container = makeContainer();
    const cellTwoFrom = text.lastIndexOf('2');
    controller.activate(root, container, cellTwoFrom, cellTwoFrom + 1, cellTwoFrom);
    expect(controller.nestedView).not.toBeNull();

    // Delete the active row's own line, including its leading newline —
    // the row (and the active cell inside it) is gone entirely.
    const rowStart = text.lastIndexOf('\n');
    const tr = root.state.update({ changes: { from: rowStart, to: text.length, insert: '' } });
    controller.remapActiveAnchor(tr);

    expect(controller.activeAnchor).toBeNull();
    expect(container.contains(controller.nestedView!.dom)).toBe(false);
  });

  it("deleting the active cell's whole table deactivates cleanly instead of mounting into a wrong cell", () => {
    const text = '| a | b |\n| - | - |\n| 1 | 2 |\n\nOther paragraph';
    const root = mountRootView(text);
    const controller = new TableActiveCellController();
    const container = makeContainer();
    const cellTwoFrom = text.lastIndexOf('2');
    controller.activate(root, container, cellTwoFrom, cellTwoFrom + 1, cellTwoFrom);
    expect(controller.nestedView).not.toBeNull();

    // Delete the whole table (everything up to, not including, the blank line).
    const tableEnd = text.indexOf('\n\n');
    const tr = root.state.update({ changes: { from: 0, to: tableEnd, insert: '' } });
    controller.remapActiveAnchor(tr);

    expect(controller.activeAnchor).toBeNull();
    expect(container.contains(controller.nestedView!.dom)).toBe(false);
  });

  it('deleting a different, inactive table leaves the truly active cell (in another table) untouched, correctly re-associated', () => {
    const text = '| a |\n| - |\n| 1 |\n\n| x | y |\n| - | - |\n| 9 | 8 |';
    const root = mountRootView(text);
    const controller = new TableActiveCellController();
    const container = makeContainer();
    const cellEightFrom = text.lastIndexOf('8');
    controller.activate(root, container, cellEightFrom, cellEightFrom + 1, cellEightFrom);

    // Delete the first table entirely (inactive — the active cell is in the second table).
    const firstTableEnd = text.indexOf('\n\n');
    const tr = root.state.update({ changes: { from: 0, to: firstTableEnd, insert: '' } });
    controller.remapActiveAnchor(tr);

    expect(controller.activeAnchor).not.toBeNull();
    expect(tr.state.sliceDoc(controller.activeAnchor!.from, controller.activeAnchor!.to)).toBe('8');
  });

  it('emptying the active cell\'s own content (select-all-and-delete) stays active — content loss is not structural loss', () => {
    const text = '| a | b |\n| - | - |\n| 1 | 2 |';
    const root = mountRootView(text);
    const controller = new TableActiveCellController();
    const container = makeContainer();
    const cellTwoFrom = text.lastIndexOf('2');
    controller.activate(root, container, cellTwoFrom, cellTwoFrom + 1, cellTwoFrom);

    // Delete only the cell's own content — the delimiters around it survive.
    const tr = root.state.update({ changes: { from: cellTwoFrom, to: cellTwoFrom + 1, insert: '' } });
    controller.remapActiveAnchor(tr);

    expect(controller.activeAnchor).toEqual({ from: cellTwoFrom, to: cellTwoFrom });
  });
});

describe('TableActiveCellController — deactivate/destroy', () => {
  it('deactivate() un-mounts the DOM but keeps the instance for reuse', () => {
    const root = mountRootView('| a | b |\n| - | - |');
    const controller = new TableActiveCellController();
    const container = makeContainer();
    controller.activate(root, container, 6, 7, 6);
    const instance = controller.nestedView;

    controller.deactivate();

    expect(controller.activeAnchor).toBeNull();
    expect(container.contains(instance!.dom)).toBe(false);

    controller.activate(root, container, 2, 3, 2);
    expect(controller.nestedView).toBe(instance);
  });

  it('destroy() tears the nested editor down entirely', () => {
    const root = mountRootView('| a | b |\n| - | - |');
    const controller = new TableActiveCellController();
    const container = makeContainer();
    controller.activate(root, container, 6, 7, 6);

    controller.destroy();

    expect(controller.nestedView).toBeNull();
    expect(controller.activeAnchor).toBeNull();
  });
});
