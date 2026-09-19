// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { selectAll } from '@codemirror/commands';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { findEnclosingTable } from './tableGeometry';
import { tableRootSelectionSnap } from './tableRootSelectionSnap';

const BASIC_TABLE = '| a | b |\n| - | - |\n| 1 | 2 |';

function makeState(doc: string): EditorState {
  return EditorState.create({ doc, extensions: [markdownLanguageExtension(), tableRootSelectionSnap()] });
}

/**
 * A real `EditorView` (not just an `EditorState`) so `selectAll` — a
 * `Command`, which operates on a `EditorView`/`StateCommand` target that
 * needs `.dispatch` — can be exercised exactly as production code invokes
 * it, rather than hand-constructing the selection `selectAll` itself would
 * produce.
 */
function makeView(doc: string): EditorView {
  return new EditorView({ state: makeState(doc) });
}

function expectOutsideAnyTable(state: EditorState, pos: number): void {
  expect(findEnclosingTable(state, pos)).toBeNull();
}

describe('tableRootSelectionSnap — non-doc-changing selection (mouse drag / keyboard extend)', () => {
  it('snaps a selection endpoint landing exactly at table.from to just before the table', () => {
    const doc = `Above.\n${BASIC_TABLE}\n\nBelow.`;
    let state = makeState(doc);
    const table = findEnclosingTable(state, doc.indexOf('| a |'))!;
    expect(table).not.toBeNull();

    const tr = state.update({ selection: { anchor: table.from }, userEvent: 'select.pointer' });
    state = tr.state;

    expect(state.selection.main.head).toBe(table.from - 1);
    expectOutsideAnyTable(state, state.selection.main.head);
  });

  it('snaps a Shift+Arrow-style extending selection whose head lands inside the table', () => {
    const doc = `Above.\n${BASIC_TABLE}\n\nBelow.`;
    let state = makeState(doc);
    const table = findEnclosingTable(state, doc.indexOf('| a |'))!;
    const anchorPos = doc.indexOf('Above.');

    const tr = state.update({ selection: { anchor: anchorPos, head: table.from + 2 }, userEvent: 'select' });
    state = tr.state;

    expect(state.selection.main.anchor).toBe(anchorPos);
    expect(state.selection.main.head).not.toBeGreaterThanOrEqual(table.from);
    expectOutsideAnyTable(state, state.selection.main.head);
  });

  it('leaves a selection entirely outside every table untouched', () => {
    const doc = `Above.\n${BASIC_TABLE}\n\nBelow.`;
    let state = makeState(doc);
    const pos = doc.indexOf('Below.');

    const tr = state.update({ selection: { anchor: pos } });
    state = tr.state;

    expect(state.selection.main.head).toBe(pos);
  });

  it('a table at document start with a violating position snaps forward, past it', () => {
    const doc = `${BASIC_TABLE}\n\nAfter.`;
    let state = makeState(doc);
    const table = findEnclosingTable(state, 0)!;

    const tr = state.update({ selection: { anchor: table.from } });
    state = tr.state;

    expect(state.selection.main.head).toBe(table.to + 1);
    expectOutsideAnyTable(state, state.selection.main.head);
  });
});

describe('tableRootSelectionSnap — paste creating a complete table in one transaction', () => {
  it('places the cursor on the first editable line after a table pasted into an empty document', () => {
    const state = makeState('');
    const pasted = `${BASIC_TABLE}\n`;

    const tr = state.update({ changes: { from: 0, to: 0, insert: pasted }, selection: { anchor: pasted.length } });

    const table = findEnclosingTable(tr.state, 0)!;
    expect(table).not.toBeNull();
    expect(tr.state.selection.main.head).toBe(table.to + 1);
    expectOutsideAnyTable(tr.state, tr.state.selection.main.head);
  });

  it('places the cursor after a table pasted into the middle of existing text', () => {
    // The pasted clipboard text itself has no trailing newline (a common,
    // realistic shape) — the pre-existing blank line/paragraph after the
    // insertion point is what actually follows the table once it lands,
    // so the paste's own end-of-insertion position collapses exactly onto
    // `table.to`, the one boundary this module treats as still unsafe.
    const before = 'Before this point.\n\n';
    const after = '\n\nAfter this point.';
    const state = makeState(before + after);
    const insertAt = before.length;
    const pasted = BASIC_TABLE;

    const tr = state.update({
      changes: { from: insertAt, to: insertAt, insert: pasted },
      selection: { anchor: insertAt + pasted.length },
    });

    const table = findEnclosingTable(tr.state, insertAt)!;
    expect(table).not.toBeNull();
    expect(tr.state.selection.main.head).toBe(table.to + 1);
    expectOutsideAnyTable(tr.state, tr.state.selection.main.head);
  });

  it('places the cursor after a table pasted at the very end of the document, with no trailing newline', () => {
    const before = 'Existing content.\n\n';
    const state = makeState(before);
    const pasted = BASIC_TABLE;

    const tr = state.update({
      changes: { from: before.length, to: before.length, insert: pasted },
      selection: { anchor: before.length + pasted.length },
    });

    const table = findEnclosingTable(tr.state, before.length)!;
    expect(table).not.toBeNull();
    // Nothing follows the table at all — `table.to` (document end) is the only valid target.
    expect(tr.state.selection.main.head).toBe(table.to);
    expect(tr.state.selection.main.head).toBe(tr.state.doc.length);
  });

  it('places the cursor after a table pasted directly above existing following text', () => {
    const pasted = `${BASIC_TABLE}\n`;
    const after = 'Already here.';
    const state = makeState(after);

    const tr = state.update({ changes: { from: 0, to: 0, insert: pasted }, selection: { anchor: pasted.length } });

    const table = findEnclosingTable(tr.state, 0)!;
    expect(tr.state.selection.main.head).toBe(table.to + 1);
    expect(tr.state.sliceDoc(tr.state.selection.main.head)).toBe(after);
  });

  it('correctly resolves the cursor against the *second* table when two tables are pasted at once', () => {
    // No trailing newline in the pasted text itself — the pre-existing
    // content after the insertion point is what actually follows the
    // second table once it lands, same shape as the "middle of existing
    // text" case above, just with two tables in the pasted range.
    const before = '';
    const after = '\n\nAfter this point.';
    const state = makeState(before + after);
    const pasted = `${BASIC_TABLE}\n\n${BASIC_TABLE}`;

    const tr = state.update({ changes: { from: 0, to: 0, insert: pasted }, selection: { anchor: pasted.length } });

    const firstTableFrom = tr.state.doc.toString().indexOf('| a |');
    const secondTableFrom = tr.state.doc.toString().lastIndexOf('| a |');
    expect(secondTableFrom).toBeGreaterThan(firstTableFrom);

    const secondTable = findEnclosingTable(tr.state, secondTableFrom)!;
    expect(tr.state.selection.main.head).toBe(secondTable.to + 1);
    expectOutsideAnyTable(tr.state, tr.state.selection.main.head);
    // The first table is entirely untouched by this correction.
    expectOutsideAnyTable(tr.state, findEnclosingTable(tr.state, firstTableFrom)!.to + 1);
  });

  it('does not move a paste selection that already lands safely outside every table', () => {
    const pasted = `${BASIC_TABLE}\n\nSome trailing text.`;
    const state = makeState('');

    const tr = state.update({ changes: { from: 0, to: 0, insert: pasted }, selection: { anchor: pasted.length } });

    expect(tr.state.selection.main.head).toBe(pasted.length);
    expectOutsideAnyTable(tr.state, tr.state.selection.main.head);
  });
});

describe('tableRootSelectionSnap — Ctrl+A / Select All spans table widgets (Milestone 1)', () => {
  it('table-only document: selects the entire document, including the table source', () => {
    const view = makeView(BASIC_TABLE);

    selectAll(view);

    const sel = view.state.selection.main;
    expect(sel.anchor).toBe(0);
    expect(sel.head).toBe(BASIC_TABLE.length);
    expect(sel.empty).toBe(false);
    expect(view.state.sliceDoc(sel.from, sel.to)).toBe(BASIC_TABLE);
  });

  it('table at document beginning: selects everything including the table', () => {
    const doc = `${BASIC_TABLE}\n\nBelow.`;
    const view = makeView(doc);

    selectAll(view);

    const sel = view.state.selection.main;
    expect(sel.anchor).toBe(0);
    expect(sel.head).toBe(doc.length);
    expect(sel.empty).toBe(false);
    expect(view.state.sliceDoc(sel.from, sel.to)).toBe(doc);
  });

  it('table in the middle: selects content before + table + content after', () => {
    const doc = `Above.\n${BASIC_TABLE}\n\nBelow.`;
    const view = makeView(doc);

    selectAll(view);

    const sel = view.state.selection.main;
    expect(sel.anchor).toBe(0);
    expect(sel.head).toBe(doc.length);
    expect(view.state.sliceDoc(sel.from, sel.to)).toBe(doc);
  });

  it('table at document end (no trailing line): selects everything including the table', () => {
    const doc = `Above.\n\n${BASIC_TABLE}`;
    const view = makeView(doc);
    const table = findEnclosingTable(view.state, doc.length - 1)!;
    expect(table.to).toBe(doc.length);

    selectAll(view);

    const sel = view.state.selection.main;
    expect(sel.anchor).toBe(0);
    expect(sel.head).toBe(doc.length);
    expect(view.state.sliceDoc(sel.from, sel.to)).toBe(doc);
  });

  it('multiple tables: selects the complete document across every table widget', () => {
    const doc = `${BASIC_TABLE}\n\nBetween.\n\n${BASIC_TABLE}`;
    const view = makeView(doc);

    selectAll(view);

    const sel = view.state.selection.main;
    expect(sel.anchor).toBe(0);
    expect(sel.head).toBe(doc.length);
    expect(view.state.sliceDoc(sel.from, sel.to)).toBe(doc);
  });

  it('typing after Select All replaces the entire document, table source included', () => {
    const doc = `${BASIC_TABLE}\n\nBelow.`;
    const view = makeView(doc);

    selectAll(view);
    view.dispatch(view.state.replaceSelection('replaced'));

    expect(view.state.doc.toString()).toBe('replaced');
    expect(findEnclosingTable(view.state, 0)).toBeNull();
  });

  it('a collapsed Select-All-shaped selection (anchor === head, both at a table boundary) is still snapped', () => {
    // Guards the "collapsed" branch of the exemption directly: same
    // 0/doc.length positions Select All would use, but dispatched as an
    // explicitly collapsed selection (anchor === head) — must still be
    // treated as an unsafe caret position, not exempted just because the
    // positions happen to match what Select All would produce.
    const doc = BASIC_TABLE;
    let state = makeState(doc);
    const table = findEnclosingTable(state, 0)!;

    const tr = state.update({ selection: { anchor: table.from, head: table.from } });
    state = tr.state;

    expect(state.selection.main.anchor).toBe(state.selection.main.head);
    expectOutsideAnyTable(state, state.selection.main.head);
  });
});
