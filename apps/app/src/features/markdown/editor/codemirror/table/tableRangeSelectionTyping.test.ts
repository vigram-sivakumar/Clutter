// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { history, redo, undo, undoDepth } from '@codemirror/commands';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { TableActiveCellController } from './tableActiveCellController';
import { tableCellNavigation } from './tableCellNavigation';
import { findAllTables } from './tableGeometry';
import { tableRangeSelectionTyping } from './tableRangeSelectionTyping';
import { tableSelectionChanged, tableSelectionField, type TableSelection } from './tableSelection';
import { tableSelectionClearKeymap } from './tableSelectionClear';
import { tableSelectionDeletionHistory } from './tableSelectionDeletion';
import { tableWidgetDecoration } from './tableWidgetField';

const mountedViews: EditorView[] = [];

afterEach(() => {
  for (const view of mountedViews.splice(0)) {
    view.destroy();
  }
});

const TABLE = '| Name | Role | City |\n| --- | --- | --- |\n| Vik | Designer | Delhi |\n| Alex | Engineer | Tokyo |\n| Sam | PM | Oslo |';

function mountViewWithController(doc: string): { view: EditorView; controller: TableActiveCellController } {
  const controller = new TableActiveCellController();
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({
    state: EditorState.create({
      doc,
      extensions: [
        markdownLanguageExtension(),
        tableWidgetDecoration(controller),
        tableSelectionField,
        tableRangeSelectionTyping(controller),
        tableSelectionClearKeymap(),
        tableSelectionDeletionHistory(),
        history(),
      ],
    }),
    parent,
  });
  controller.setNestedExtensions([tableCellNavigation(() => view, controller)]);
  mountedViews.push(view);
  return { view, controller };
}

function tableFrom(view: EditorView): number {
  return findAllTables(view.state)[0]!.from;
}

function selectRange(view: EditorView, anchor: { row: number; col: number }, head: { row: number; col: number }, anchorCaretOffset: number): void {
  const range: TableSelection = { kind: 'range', tableFrom: tableFrom(view), anchor, head, anchorCaretOffset };
  view.dispatch({ effects: [tableSelectionChanged.of(range)] });
}

function selection(view: EditorView): TableSelection | null {
  return view.state.field(tableSelectionField);
}

function typeChar(view: EditorView, data: string): void {
  const event = new InputEvent('beforeinput', { inputType: 'insertText', data, bubbles: true, cancelable: true });
  view.contentDOM.dispatchEvent(event);
}

/** The active cell's own nested-editor document text, or `null` if no cell is active. */
function activeCellText(controller: TableActiveCellController): string | null {
  return controller.nestedView && controller.activeAnchor ? controller.nestedView.state.doc.toString() : null;
}

describe('tableRangeSelectionTyping — clears the range and activates the anchor', () => {
  it('clears the range selection', () => {
    const { view } = mountViewWithController(TABLE);
    selectRange(view, { row: 1, col: 0 }, { row: 1, col: 1 }, 3); // anchor: "Vik", head: "Designer"

    typeChar(view, 'X');

    expect(selection(view)).toBeNull();
  });

  it('activates the anchor cell, not the head cell', () => {
    const { view, controller } = mountViewWithController(TABLE);
    selectRange(view, { row: 1, col: 0 }, { row: 3, col: 2 }, 3); // anchor: "Vik", head: "Oslo"

    typeChar(view, 'X');

    expect(activeCellText(controller)).toBe('VikX');
  });

  it('leaves other cells in the selected range unchanged', () => {
    const { view } = mountViewWithController(TABLE);
    selectRange(view, { row: 1, col: 0 }, { row: 1, col: 1 }, 3); // anchor: "Vik", head: "Designer"

    typeChar(view, 'X');

    expect(view.state.doc.toString()).toContain('Designer');
    expect(view.state.doc.toString()).not.toContain('DesignerX');
  });
});

describe('tableRangeSelectionTyping — inserts at the anchor\'s own existing caret position', () => {
  it('inserting at content end appends (caret was after "Vik")', () => {
    const { view, controller } = mountViewWithController(TABLE);
    selectRange(view, { row: 1, col: 0 }, { row: 1, col: 1 }, 3); // "Vik".length === 3

    typeChar(view, 'Hello');

    expect(activeCellText(controller)).toBe('VikHello');
    expect(controller.nestedView!.state.selection.main.head).toBe('VikHello'.length);
  });

  it('inserting in the middle preserves both halves ("V|ik" + "Hello" -> "VHello|ik")', () => {
    const { view, controller } = mountViewWithController(TABLE);
    selectRange(view, { row: 1, col: 0 }, { row: 1, col: 1 }, 1); // caret between "V" and "ik"

    typeChar(view, 'Hello');

    expect(activeCellText(controller)).toBe('VHelloik');
    expect(controller.nestedView!.state.selection.main.head).toBe('VHello'.length);
  });

  it('inserting at content start preserves the whole original content after it', () => {
    const { view, controller } = mountViewWithController(TABLE);
    selectRange(view, { row: 1, col: 0 }, { row: 1, col: 1 }, 0); // caret before "V"

    typeChar(view, 'Hello');

    expect(activeCellText(controller)).toBe('HelloVik');
    expect(controller.nestedView!.state.selection.main.head).toBe('Hello'.length);
  });

  it('typing into an empty anchor cell works', () => {
    const doc = '| Name | Role |\n| --- | --- |\n|  | Designer |';
    const { view, controller } = mountViewWithController(doc);
    selectRange(view, { row: 1, col: 0 }, { row: 1, col: 1 }, 0);

    typeChar(view, 'Hi');

    expect(activeCellText(controller)).toBe('Hi');
  });

  it('multi-character input is inserted as one unit, caret after all of it', () => {
    const { view, controller } = mountViewWithController(TABLE);
    selectRange(view, { row: 1, col: 0 }, { row: 1, col: 1 }, 3);

    typeChar(view, 'World');

    expect(activeCellText(controller)).toBe('VikWorld');
    expect(controller.nestedView!.state.selection.main.head).toBe('VikWorld'.length);
  });
});

describe('tableRangeSelectionTyping — undo/history', () => {
  it('a single Cmd/Ctrl+Z restores the exact pre-typing document', () => {
    const { view } = mountViewWithController(TABLE);
    const docBefore = view.state.doc.toString();
    selectRange(view, { row: 1, col: 0 }, { row: 1, col: 1 }, 3);

    typeChar(view, 'Hello');
    expect(view.state.doc.toString()).not.toBe(docBefore);

    undo(view);

    expect(view.state.doc.toString()).toBe(docBefore);
  });

  it('the selection-clearing/anchor-activation bookkeeping does not create its own undo step', () => {
    const { view } = mountViewWithController(TABLE);
    selectRange(view, { row: 1, col: 0 }, { row: 1, col: 1 }, 3);

    typeChar(view, 'Hello');

    // Exactly one undoable change exists — if clearing/activation had
    // wrongly produced their own history entries, this would be > 1.
    expect(undoDepth(view.state)).toBe(1);
  });

  it('redo restores the typed text after an undo', () => {
    const { view, controller } = mountViewWithController(TABLE);
    selectRange(view, { row: 1, col: 0 }, { row: 1, col: 1 }, 3);
    typeChar(view, 'Hello');
    undo(view);

    redo(view);

    expect(view.state.doc.toString()).toContain('VikHello');
    // Redo doesn't itself reactivate a cell (it's an ordinary root history
    // step) — asserting only the document content, not activation state.
    void controller;
  });
});

describe('tableRangeSelectionTyping — scoped strictly to an active range selection', () => {
  it('does not intercept typing when no TableSelection exists', () => {
    const { view, controller } = mountViewWithController(TABLE);

    typeChar(view, 'X');

    // Declined entirely — no cell activation, no document change from this module.
    expect(controller.activeAnchor).toBeNull();
    expect(view.state.doc.toString()).toBe(TABLE);
  });

  it('does not intercept typing for a row-kind TableSelection', () => {
    const { view, controller } = mountViewWithController(TABLE);
    view.dispatch({ effects: [tableSelectionChanged.of({ kind: 'row', tableFrom: tableFrom(view), rowIndex: 1 })] });

    typeChar(view, 'X');

    expect(controller.activeAnchor).toBeNull();
    expect(view.state.doc.toString()).toBe(TABLE);
  });

  it('does not intercept a composition (IME) beforeinput event', () => {
    const { view, controller } = mountViewWithController(TABLE);
    selectRange(view, { row: 1, col: 0 }, { row: 1, col: 1 }, 3);

    const event = new InputEvent('beforeinput', { inputType: 'insertCompositionText', data: 'X', bubbles: true, cancelable: true });
    view.contentDOM.dispatchEvent(event);

    // Declined — the range selection is left exactly as it was (this
    // milestone's own explicit IME-out-of-scope decision).
    expect(selection(view)?.kind).toBe('range');
    expect(controller.activeAnchor).toBeNull();
  });
});

describe('tableRangeSelectionTyping — end-to-end with a real drag gesture', () => {
  function findCell(view: EditorView, text: string): HTMLElement {
    const cell = Array.from(view.dom.querySelectorAll('th, td')).find((el) => el.textContent === text);
    if (!cell) {
      throw new Error(`no cell with text "${text}"`);
    }
    return cell as HTMLElement;
  }

  function mockElementFromPoint(): (el: Element | null) => void {
    let current: Element | null = null;
    document.elementFromPoint = ((): Element | null => current) as typeof document.elementFromPoint;
    return (el) => {
      current = el;
    };
  }

  it('a real drag captures the anchor\'s caret, and typing afterward restores it (not just a direct TableSelection dispatch)', () => {
    const { view, controller } = mountViewWithController(TABLE);
    const setTarget = mockElementFromPoint();

    findCell(view, 'Vik').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    setTarget(findCell(view, 'Designer'));
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));

    expect(selection(view)?.kind).toBe('range');

    typeChar(view, 'X');

    // The captured anchor caret in this harness's synthetic mousedown
    // (no real `clientX`/`clientY`, per this suite's own established
    // convention — see `tableCellRangeSelection.test.ts`) resolves to
    // position 0 — asserting the *mechanism* connects end-to-end, not a
    // specific offset value (already covered precisely by the direct-
    // dispatch tests above).
    expect(activeCellText(controller)).toBe('XVik');
  });
});

describe('tableRangeSelectionTyping — Backspace/Delete on a range remain unchanged (regression)', () => {
  it('Delete still clears the selected cells\' content and keeps the selection active, unaffected by this module', () => {
    const { view } = mountViewWithController(TABLE);
    selectRange(view, { row: 1, col: 0 }, { row: 1, col: 1 }, 3);

    view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }));

    expect(view.state.doc.toString()).not.toContain('Vik');
    expect(view.state.doc.toString()).not.toContain('Designer');
    expect(selection(view)?.kind).toBe('range');
  });
});
