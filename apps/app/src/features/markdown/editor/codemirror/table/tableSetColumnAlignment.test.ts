// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { history, redo, undo, undoDepth } from '@codemirror/commands';
import { EditorSelection, EditorState, type StateEffect } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { tableSelectionChanged, tableSelectionField, type TableSelection } from './tableSelection';
import { tableSelectionDeletionHistory } from './tableSelectionDeletion';
import { resolveColumnAlignment, setSelectedColumnAlignment } from './tableSetColumnAlignment';

const mountedViews: EditorView[] = [];

afterEach(() => {
  for (const view of mountedViews.splice(0)) {
    view.destroy();
  }
});

function mountRootView(doc: string): EditorView {
  const view = new EditorView({
    state: EditorState.create({
      doc,
      selection: EditorSelection.cursor(0),
      extensions: [markdownLanguageExtension(), tableSelectionField, tableSelectionDeletionHistory(), history()],
    }),
    parent: document.body.appendChild(document.createElement('div')),
  });
  mountedViews.push(view);
  return view;
}

function selectTable(view: EditorView, selection: TableSelection | null): void {
  view.dispatch({ effects: tableSelectionChanged.of(selection) });
}

function currentSelection(view: EditorView): TableSelection | null {
  return view.state.field(tableSelectionField);
}

const THREE_COLS = '| Name | Role | City |\n| --- | --- | --- |\n| Vik | Designer | NYC |\n| Sam | Engineer | SF |';

describe('setSelectedColumnAlignment — setting each alignment', () => {
  it('sets a plain column to left (:---)', () => {
    const view = mountRootView(THREE_COLS);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 0 });

    const handled = setSelectedColumnAlignment(view, currentSelection(view)!, 'left');

    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe('| Name | Role | City |\n| :--- | --- | --- |\n| Vik | Designer | NYC |\n| Sam | Engineer | SF |');
  });

  it('sets a plain column to center (:---:)', () => {
    const view = mountRootView(THREE_COLS);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 1 });

    setSelectedColumnAlignment(view, currentSelection(view)!, 'center');

    expect(view.state.doc.toString()).toBe('| Name | Role | City |\n| --- | :---: | --- |\n| Vik | Designer | NYC |\n| Sam | Engineer | SF |');
  });

  it('sets a plain column to right (---:)', () => {
    const view = mountRootView(THREE_COLS);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 2 });

    setSelectedColumnAlignment(view, currentSelection(view)!, 'right');

    expect(view.state.doc.toString()).toBe('| Name | Role | City |\n| --- | --- | ---: |\n| Vik | Designer | NYC |\n| Sam | Engineer | SF |');
  });

  it('changes an already-aligned column to a different alignment', () => {
    const doc = '| Name | Role |\n| :--- | :---: |\n| Vik | Designer |';
    const view = mountRootView(doc);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 0 });

    setSelectedColumnAlignment(view, currentSelection(view)!, 'right');

    expect(view.state.doc.toString()).toBe('| Name | Role |\n| ---: | :---: |\n| Vik | Designer |');
  });

  it('only touches the selected column\'s own marker — every other column\'s alignment is untouched', () => {
    const doc = '| A | B | C |\n| :--- | :---: | ---: |\n| a | b | c |';
    const view = mountRootView(doc);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 1 });

    setSelectedColumnAlignment(view, currentSelection(view)!, 'left');

    expect(view.state.doc.toString()).toBe('| A | B | C |\n| :--- | :--- | ---: |\n| a | b | c |');
  });
});

describe('setSelectedColumnAlignment — preserves content and selection', () => {
  it('preserves every cell\'s own content verbatim (header, empty cells, escaped pipes)', () => {
    const doc = '| Name | Note |\n| --- | --- |\n| A \\| B |  |\n| C | *text* |';
    const view = mountRootView(doc);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 0 });

    setSelectedColumnAlignment(view, currentSelection(view)!, 'center');

    expect(view.state.doc.toString()).toBe('| Name | Note |\n| :---: | --- |\n| A \\| B |  |\n| C | *text* |');
  });

  it('keeps the table rectangular (row/column count unchanged)', () => {
    const view = mountRootView(THREE_COLS);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 1 });

    setSelectedColumnAlignment(view, currentSelection(view)!, 'center');

    const lines = view.state.doc.toString().split('\n');
    expect(lines).toHaveLength(4);
    expect(lines[1]!.split('|')).toHaveLength(THREE_COLS.split('\n')[1]!.split('|').length);
  });
});

// ---------------------------------------------------------------------------
// Regression: TableSelection must persist across an alignment change —
// "Select column → Align → Center → Markdown updates → SAME column remains
// selected," for every one of the three alignment options, not just one.
// `setColumnAlignment`'s own dispatch (tableSetColumnAlignment.ts) never
// includes a `tableActiveCellChanged` effect, so it can never activate a
// cell either — confirmed directly from that function's own source, not
// re-derived here; these tests instead pin down the one thing a caller can
// actually observe from outside: the resolved `TableSelection` value itself.
// ---------------------------------------------------------------------------

describe('setSelectedColumnAlignment — selection persistence (regression)', () => {
  it('Left: the same column remains selected after the transaction', () => {
    const view = mountRootView(THREE_COLS);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 0 });

    const handled = setSelectedColumnAlignment(view, currentSelection(view)!, 'left');

    expect(handled).toBe(true);
    expect(currentSelection(view)).toEqual({ kind: 'column', tableFrom: 0, columnIndex: 0 });
  });

  it('Center: the same column remains selected after the transaction', () => {
    const view = mountRootView(THREE_COLS);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 1 });

    const handled = setSelectedColumnAlignment(view, currentSelection(view)!, 'center');

    expect(handled).toBe(true);
    expect(currentSelection(view)).toEqual({ kind: 'column', tableFrom: 0, columnIndex: 1 });
  });

  it('Right: the same column remains selected after the transaction', () => {
    const view = mountRootView(THREE_COLS);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 2 });

    const handled = setSelectedColumnAlignment(view, currentSelection(view)!, 'right');

    expect(handled).toBe(true);
    expect(currentSelection(view)).toEqual({ kind: 'column', tableFrom: 0, columnIndex: 2 });
  });

  it('selection survives switching alignment on the same column multiple times in a row (Left, then Center, then Right)', () => {
    const view = mountRootView(THREE_COLS);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 1 });

    setSelectedColumnAlignment(view, currentSelection(view)!, 'left');
    expect(currentSelection(view)).toEqual({ kind: 'column', tableFrom: 0, columnIndex: 1 });

    setSelectedColumnAlignment(view, currentSelection(view)!, 'center');
    expect(currentSelection(view)).toEqual({ kind: 'column', tableFrom: 0, columnIndex: 1 });

    setSelectedColumnAlignment(view, currentSelection(view)!, 'right');
    expect(currentSelection(view)).toEqual({ kind: 'column', tableFrom: 0, columnIndex: 1 });
  });

  it('the transaction never sets an explicit tableActiveCellChanged-style activation — the dispatched effects are exactly one tableSelectionChanged', () => {
    const view = mountRootView(THREE_COLS);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 1 });
    const dispatchSpy = vi.spyOn(view, 'dispatch');

    setSelectedColumnAlignment(view, currentSelection(view)!, 'center');

    const tr = dispatchSpy.mock.calls.at(-1)![0] as { effects?: readonly StateEffect<unknown>[] };
    expect(tr.effects).toHaveLength(1);
    expect(tr.effects![0]!.is(tableSelectionChanged)).toBe(true);
  });

  it('root selection is remapped through the edit, never reset to an unrelated position', () => {
    const view = mountRootView(THREE_COLS);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 1 });
    // Place the root caret inside a body cell, well past the delimiter row
    // this operation rewrites — a position this function must carry
    // forward via ChangeSet mapping, not silently drop or reset.
    const bodyRowStart = view.state.doc.line(3).from;
    view.dispatch({ selection: { anchor: bodyRowStart + 2 } });
    const beforeOffset = bodyRowStart + 2;

    setSelectedColumnAlignment(view, currentSelection(view)!, 'center');

    // ':---:' (5 chars) replaces '---' (3 chars) in the delimiter cell — a
    // net +2 characters landing entirely before the body row, so the root
    // caret (on a later line) shifts forward by exactly that delta rather
    // than jumping to some unrelated position (e.g. document start).
    expect(view.state.selection.main.from).toBe(beforeOffset + 2);
  });
});

describe('setSelectedColumnAlignment — guards', () => {
  it('returns false for a row selection', () => {
    const view = mountRootView(THREE_COLS);
    expect(setSelectedColumnAlignment(view, { kind: 'row', tableFrom: 0, rowIndex: 0 }, 'left')).toBe(false);
    expect(view.state.doc.toString()).toBe(THREE_COLS);
  });

  it('returns false when the table can no longer be found', () => {
    const view = mountRootView(THREE_COLS);
    expect(setSelectedColumnAlignment(view, { kind: 'column', tableFrom: 9999, columnIndex: 0 }, 'left')).toBe(false);
  });

  it('returns false for an out-of-range column index', () => {
    const view = mountRootView(THREE_COLS);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 0 });
    expect(setSelectedColumnAlignment(view, { kind: 'column', tableFrom: 0, columnIndex: 99 }, 'left')).toBe(false);
    expect(view.state.doc.toString()).toBe(THREE_COLS);
  });
});

describe('setSelectedColumnAlignment — undo/redo', () => {
  it('is exactly one undo step, restoring selection on both sides', () => {
    const view = mountRootView(THREE_COLS);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 1 });
    const depthBefore = undoDepth(view.state);

    setSelectedColumnAlignment(view, currentSelection(view)!, 'right');
    const afterAlign = view.state.doc.toString();
    expect(afterAlign).not.toBe(THREE_COLS);
    expect(undoDepth(view.state)).toBe(depthBefore + 1);

    undo(view);
    expect(view.state.doc.toString()).toBe(THREE_COLS);
    expect(currentSelection(view)).toEqual({ kind: 'column', tableFrom: 0, columnIndex: 1 });

    redo(view);
    expect(view.state.doc.toString()).toBe(afterAlign);
    expect(currentSelection(view)).toEqual({ kind: 'column', tableFrom: 0, columnIndex: 1 });
  });
});

describe('resolveColumnAlignment', () => {
  it('resolves null for a plain (unaligned) column', () => {
    const view = mountRootView(THREE_COLS);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 0 });
    expect(resolveColumnAlignment(view, currentSelection(view)!)).toBeNull();
  });

  it('resolves the current explicit alignment', () => {
    const doc = '| A | B | C |\n| :--- | :---: | ---: |\n| a | b | c |';
    const view = mountRootView(doc);

    expect(resolveColumnAlignment(view, { kind: 'column', tableFrom: 0, columnIndex: 0 })).toBe('left');
    expect(resolveColumnAlignment(view, { kind: 'column', tableFrom: 0, columnIndex: 1 })).toBe('center');
    expect(resolveColumnAlignment(view, { kind: 'column', tableFrom: 0, columnIndex: 2 })).toBe('right');
  });

  it('returns null for a row selection', () => {
    const view = mountRootView(THREE_COLS);
    expect(resolveColumnAlignment(view, { kind: 'row', tableFrom: 0, rowIndex: 0 })).toBeNull();
  });

  it('returns null when the table cannot be found', () => {
    const view = mountRootView(THREE_COLS);
    expect(resolveColumnAlignment(view, { kind: 'column', tableFrom: 9999, columnIndex: 0 })).toBeNull();
  });

  it('reflects a just-changed alignment immediately', () => {
    const view = mountRootView(THREE_COLS);
    selectTable(view, { kind: 'column', tableFrom: 0, columnIndex: 0 });

    setSelectedColumnAlignment(view, currentSelection(view)!, 'right');

    expect(resolveColumnAlignment(view, currentSelection(view)!)).toBe('right');
  });
});
