// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { TableActiveCellController } from './tableActiveCellController';
import { tableCellNavigation } from './tableCellNavigation';
import { tableDeletionSelectionField, tableWholeDeletionKeymap } from './tableDeletionSelection';
import { findAllTables, findEnclosingTable } from './tableGeometry';
import { tableWidgetDecoration } from './tableWidgetField';

const mountedViews: EditorView[] = [];

afterEach(() => {
  for (const view of mountedViews.splice(0)) {
    view.destroy();
  }
});

function mountRootView(doc: string, pos: number): { view: EditorView; controller: TableActiveCellController } {
  const controller = new TableActiveCellController();
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({
    state: EditorState.create({
      doc,
      selection: EditorSelection.cursor(pos),
      extensions: [markdownLanguageExtension(), tableWidgetDecoration(controller), tableDeletionSelectionField, tableWholeDeletionKeymap()],
    }),
    parent,
  });
  controller.setNestedExtensions([tableCellNavigation(() => view, controller)]);
  mountedViews.push(view);
  return { view, controller };
}

function dispatchKey(view: EditorView, key: string): void {
  view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

const TABLE = '| Name | Role |\n| --- | --- |\n| Vik | Designer |';

describe('tableWholeDeletionKeymap — first Backspace below table arms whole-table selection', () => {
  it('marks the table selected without moving the root selection or changing the document', () => {
    const doc = `${TABLE}\n`;
    const { view } = mountRootView(doc, doc.length);
    const headBefore = view.state.selection.main.head;

    dispatchKey(view, 'Backspace');

    expect(view.state.field(tableDeletionSelectionField)).toBe(0); // table.from
    expect(view.state.doc.toString()).toBe(doc);
    expect(view.state.selection.main.head).toBe(headBefore);
  });

  it('renders the visible "selected" class on the table widget', () => {
    const doc = `${TABLE}\n`;
    const { view } = mountRootView(doc, doc.length);

    dispatchKey(view, 'Backspace');

    expect(view.dom.querySelector('.cm-table-wrapper-selected')).toBeTruthy();
  });

  it('does nothing when the line below the table is not blank', () => {
    const doc = `${TABLE}\n\nSomething else.`;
    const { view } = mountRootView(doc, doc.length);

    dispatchKey(view, 'Backspace');

    // Declines entirely — this test harness (matching
    // tableBoundaryNavigation.test.ts's own convention) has no
    // defaultKeymap installed, so a decline here means the document stays
    // byte-for-byte unchanged, not that some other handler took over.
    expect(view.state.field(tableDeletionSelectionField)).toBeNull();
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('does nothing when the cursor is not on the line directly below the table', () => {
    const doc = `${TABLE}\n\nfar below`;
    const { view } = mountRootView(doc, 0); // start of the header line

    dispatchKey(view, 'Backspace');

    expect(view.state.field(tableDeletionSelectionField)).toBeNull();
    expect(view.state.doc.toString()).toBe(doc);
  });
});

describe('tableWholeDeletionKeymap — second press deletes the table', () => {
  it('second Backspace deletes the whole table and lands the cursor outside it', () => {
    const doc = `${TABLE}\n`;
    const { view } = mountRootView(doc, doc.length);

    dispatchKey(view, 'Backspace'); // arm
    dispatchKey(view, 'Backspace'); // delete

    expect(view.state.doc.toString()).toBe('\n');
    expect(view.state.field(tableDeletionSelectionField)).toBeNull();
    const head = view.state.selection.main.head;
    expect(findEnclosingTable(view.state, head)).toBeNull();
    expect(view.dom.querySelector('.cm-table-widget')).toBeNull();
  });

  it('Delete also deletes the table once armed', () => {
    const doc = `${TABLE}\n`;
    const { view } = mountRootView(doc, doc.length);

    dispatchKey(view, 'Backspace'); // arm
    dispatchKey(view, 'Delete'); // delete

    expect(view.state.doc.toString()).toBe('\n');
    expect(view.state.field(tableDeletionSelectionField)).toBeNull();
    expect(view.dom.querySelector('.cm-table-widget')).toBeNull();
  });

  it('Delete alone (without a prior arming Backspace) does not delete the table', () => {
    const doc = `${TABLE}\n`;
    const { view } = mountRootView(doc, doc.length);

    dispatchKey(view, 'Delete');

    expect(view.state.doc.toString()).toBe(doc);
    expect(view.dom.querySelector('.cm-table-widget')).toBeTruthy();
  });

  it('moving the selection away before the second press disarms it — Backspace no longer deletes the table', () => {
    const blankDoc = `${TABLE}\n\nBelow.`;
    const { view } = mountRootView(blankDoc, TABLE.length + 1); // the genuinely blank line right after the table

    dispatchKey(view, 'Backspace'); // arms, cursor stays on the blank line
    expect(view.state.field(tableDeletionSelectionField)).toBe(0);

    // Move the selection elsewhere (simulating a click/arrow move away).
    view.dispatch({ selection: { anchor: blankDoc.length } });
    expect(view.state.field(tableDeletionSelectionField)).toBeNull();

    dispatchKey(view, 'Backspace'); // ordinary backspace now — deletes a character of "Below.", not the table
    expect(view.state.doc.toString()).not.toBe(`\n${TABLE}`);
    expect(view.dom.querySelector('.cm-table-widget')).toBeTruthy();
  });
});

describe('tableWholeDeletionKeymap — the root selection never resolves inside the table', () => {
  it('at every step of arm → delete, findEnclosingTable never matches the root selection', () => {
    const doc = `${TABLE}\n`;
    const { view } = mountRootView(doc, doc.length);

    expect(findEnclosingTable(view.state, view.state.selection.main.head)).toBeNull();

    dispatchKey(view, 'Backspace'); // arm
    expect(findEnclosingTable(view.state, view.state.selection.main.head)).toBeNull();

    dispatchKey(view, 'Backspace'); // delete
    expect(findEnclosingTable(view.state, view.state.selection.main.head)).toBeNull();
  });

  it('activating a cell while armed disarms it, even though activation moves no root selection at all', () => {
    // Regression: `TableActiveCellController.activate()` dispatches only
    // `tableActiveCellChanged` — no document change and no root
    // `selection` field — so a plain click into a cell right after arming
    // previously left the table visibly "selected" (armed) forever,
    // confirmed live in the browser before this check was added.
    const doc = `${TABLE}\n`;
    const { view, controller } = mountRootView(doc, doc.length);

    dispatchKey(view, 'Backspace'); // arm
    expect(view.state.field(tableDeletionSelectionField)).toBe(0);

    const wrapper = document.createElement('div');
    controller.activate(view, wrapper, 2, 6, 6); // click into "Name"

    expect(view.state.field(tableDeletionSelectionField)).toBeNull();
    expect(view.dom.querySelector('.cm-table-wrapper-selected')).toBeNull();
  });
});

describe('tableWholeDeletionKeymap — existing cell-level Backspace/Delete rules remain intact', () => {
  // "Name" is the header cell's own trimmed content range within
  // TABLE ('| Name | Role |\n...') — [2, 6), not [0, 4) (that would
  // include the leading "| ").
  const NAME_CELL_FROM = 2;
  const NAME_CELL_TO = 6;

  it('Backspace at the very start of an empty cell does nothing (no pipe deletion, no exit)', () => {
    const doc = `| Name | Role |\n| --- | --- |\n|  | Designer |\n`;
    const { view, controller } = mountRootView(doc, doc.length);
    const wrapper = document.createElement('div');
    // The body row's own first (empty) cell: "|  | Designer |" — content range is zero-width.
    const bodyRowStart = doc.indexOf('|  | Designer |');
    const emptyCellPos = bodyRowStart + 2;
    controller.activate(view, wrapper, emptyCellPos, emptyCellPos, emptyCellPos);

    dispatchKey(controller.nestedView!, 'Backspace');

    expect(controller.nestedView!.state.doc.toString()).toBe('');
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('Backspace at the start of a non-empty cell does nothing (cannot reach the root-level "|")', () => {
    const doc = `${TABLE}\n`;
    const { view, controller } = mountRootView(doc, doc.length);
    const wrapper = document.createElement('div');
    controller.activate(view, wrapper, NAME_CELL_FROM, NAME_CELL_TO, NAME_CELL_FROM); // "Name", caret at position 0

    dispatchKey(controller.nestedView!, 'Backspace');

    expect(controller.nestedView!.state.doc.toString()).toBe('Name');
    expect(view.state.sliceDoc(0, 15)).toBe('| Name | Role |');
  });

  it('Delete at the end of a cell does nothing (cannot reach the root-level "|")', () => {
    const doc = `${TABLE}\n`;
    const { view, controller } = mountRootView(doc, doc.length);
    const wrapper = document.createElement('div');
    controller.activate(view, wrapper, NAME_CELL_FROM, NAME_CELL_TO, NAME_CELL_TO); // "Name", caret at its own end

    dispatchKey(controller.nestedView!, 'Delete');

    expect(controller.nestedView!.state.doc.toString()).toBe('Name');
    expect(view.state.sliceDoc(0, 15)).toBe('| Name | Role |');
  });

  it('an active-cell Backspace/Delete never arms or triggers the whole-table deletion state', () => {
    const doc = `${TABLE}\n`;
    const { view, controller } = mountRootView(doc, doc.length);
    const wrapper = document.createElement('div');
    controller.activate(view, wrapper, NAME_CELL_FROM, NAME_CELL_TO, NAME_CELL_TO);

    dispatchKey(controller.nestedView!, 'Backspace');

    expect(view.state.field(tableDeletionSelectionField)).toBeNull();
    expect(view.dom.querySelector('.cm-table-widget')).toBeTruthy();
  });
});

describe('tableWholeDeletionKeymap — symmetric: first Delete above table arms whole-table selection', () => {
  it('marks the table selected without moving the root selection or changing the document', () => {
    const doc = `Some text.\n${TABLE}`;
    const posAboveEnd = 'Some text.'.length;
    const { view } = mountRootView(doc, posAboveEnd);

    dispatchKey(view, 'Delete');

    expect(view.state.field(tableDeletionSelectionField)).toBe(posAboveEnd + 1); // table.from
    expect(view.state.doc.toString()).toBe(doc);
    expect(view.state.selection.main.head).toBe(posAboveEnd);
  });

  it('renders the visible "selected" class on the table widget', () => {
    const doc = `Some text.\n${TABLE}`;
    const { view } = mountRootView(doc, 'Some text.'.length);

    dispatchKey(view, 'Delete');

    expect(view.dom.querySelector('.cm-table-wrapper-selected')).toBeTruthy();
  });

  it('does nothing when the cursor is not at the end of the line directly above the table', () => {
    const doc = `Some text.\n${TABLE}`;
    const { view } = mountRootView(doc, 0); // start of "Some text.", not its end

    dispatchKey(view, 'Delete');

    expect(view.state.field(tableDeletionSelectionField)).toBeNull();
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('a plain Backspace at the same position (end of the line above) never arms anything — declines entirely, like every other non-matching case', () => {
    const doc = `Some text.\n${TABLE}`;
    const posAboveEnd = 'Some text.'.length;
    const { view } = mountRootView(doc, posAboveEnd);

    dispatchKey(view, 'Backspace');

    // Declines entirely — this test harness has no `defaultKeymap`
    // installed (same convention as this file's other decline tests), so
    // a decline here means the document stays byte-for-byte unchanged;
    // the important assertion is that this key never *arms* the table.
    expect(view.state.field(tableDeletionSelectionField)).toBeNull();
    expect(view.state.doc.toString()).toBe(doc);
  });

  it('a plain Delete on an ordinary blank line never arms anything — only a line directly above a table does', () => {
    const doc = `Some text.\n\nMore text.`;
    const { view } = mountRootView(doc, 'Some text.'.length + 1); // the blank line

    dispatchKey(view, 'Delete');

    expect(view.state.field(tableDeletionSelectionField)).toBeNull();
    expect(view.state.doc.toString()).toBe(doc);
  });
});

describe('tableWholeDeletionKeymap — symmetric: second press (either key) deletes from the "above" arm', () => {
  it('second Delete deletes the whole table and lands the cursor outside it', () => {
    const doc = `Some text.\n${TABLE}`;
    const posAboveEnd = 'Some text.'.length;
    const { view } = mountRootView(doc, posAboveEnd);

    dispatchKey(view, 'Delete'); // arm
    dispatchKey(view, 'Delete'); // delete

    expect(view.state.doc.toString()).toBe('Some text.\n');
    expect(view.state.field(tableDeletionSelectionField)).toBeNull();
    expect(findEnclosingTable(view.state, view.state.selection.main.head)).toBeNull();
    expect(view.dom.querySelector('.cm-table-widget')).toBeNull();
  });

  it('Backspace also deletes the table once armed from above — the two keys are interchangeable once armed', () => {
    const doc = `Some text.\n${TABLE}`;
    const posAboveEnd = 'Some text.'.length;
    const { view } = mountRootView(doc, posAboveEnd);

    dispatchKey(view, 'Delete'); // arm
    dispatchKey(view, 'Backspace'); // delete

    expect(view.state.doc.toString()).toBe('Some text.\n');
    expect(view.state.field(tableDeletionSelectionField)).toBeNull();
    expect(view.dom.querySelector('.cm-table-widget')).toBeNull();
  });

  it('Backspace also deletes the table once armed from below (already covered above) — confirms the reverse pairing symmetrically', () => {
    const doc = `${TABLE}\n`;
    const { view } = mountRootView(doc, doc.length);

    dispatchKey(view, 'Backspace'); // arm from below
    dispatchKey(view, 'Delete'); // delete

    expect(view.state.doc.toString()).toBe('\n');
    expect(view.dom.querySelector('.cm-table-widget')).toBeNull();
  });
});

describe('tableWholeDeletionKeymap — document position coverage', () => {
  it('table at the very beginning of the document (arm+delete from below)', () => {
    const doc = `${TABLE}\n`;
    const { view } = mountRootView(doc, doc.length);
    const table = findAllTables(view.state)[0]!;
    expect(table.from).toBe(0);

    dispatchKey(view, 'Backspace');
    dispatchKey(view, 'Backspace');

    expect(view.state.doc.toString()).toBe('\n');
    expect(view.state.selection.main.head).toBe(0);
  });

  it('table in the middle of the document (arm+delete from below leaves surrounding content intact)', () => {
    const doc = `Intro.\n\n${TABLE}\n\nOutro.`;
    const posBelow = `Intro.\n\n${TABLE}\n`.length; // the blank line right after the table
    const { view } = mountRootView(doc, posBelow);

    dispatchKey(view, 'Backspace'); // arm
    dispatchKey(view, 'Backspace'); // delete

    expect(view.state.doc.toString()).toBe('Intro.\n\n\n\nOutro.');
    expect(findAllTables(view.state)).toHaveLength(0);
  });

  it('table in the middle of the document (arm+delete from above leaves surrounding content intact)', () => {
    const doc = `Intro.\n\n${TABLE}\n\nOutro.`;
    const posAbove = 'Intro.\n'.length; // end of the blank line right above the table
    const { view } = mountRootView(doc, posAbove);

    dispatchKey(view, 'Delete'); // arm
    dispatchKey(view, 'Delete'); // delete

    expect(view.state.doc.toString()).toBe('Intro.\n\n\n\nOutro.');
    expect(findAllTables(view.state)).toHaveLength(0);
  });

  it('table at the very end of the document (arm+delete from above)', () => {
    const doc = `Intro.\n\n${TABLE}`;
    const posAbove = 'Intro.\n'.length;
    const { view } = mountRootView(doc, posAbove);

    dispatchKey(view, 'Delete'); // arm
    dispatchKey(view, 'Delete'); // delete

    expect(view.state.doc.toString()).toBe('Intro.\n\n');
    expect(findAllTables(view.state)).toHaveLength(0);
  });

  it('multiple tables with content between them — deleting one from below leaves the other untouched', () => {
    const TABLE2 = '| A | B |\n| - | - |\n| 1 | 2 |';
    const doc = `${TABLE}\n\n${TABLE2}\n`;
    const posBelowFirst = `${TABLE}\n`.length; // blank line between the two tables
    const { view } = mountRootView(doc, posBelowFirst);

    dispatchKey(view, 'Backspace'); // arms the FIRST table (below it)
    dispatchKey(view, 'Backspace'); // deletes it

    expect(view.state.doc.toString()).toBe(`\n\n${TABLE2}\n`);
    const remaining = findAllTables(view.state);
    expect(remaining).toHaveLength(1);
    expect(view.state.sliceDoc(remaining[0]!.from, remaining[0]!.to)).toBe(TABLE2);
  });

  it('multiple tables sharing one blank line — Delete on that line arms the table below it, not the one above', () => {
    const TABLE2 = '| A | B |\n| - | - |\n| 1 | 2 |';
    const doc = `${TABLE}\n\n${TABLE2}\n`;
    const sharedBlankLine = `${TABLE}\n`.length;
    const { view } = mountRootView(doc, sharedBlankLine);

    dispatchKey(view, 'Delete'); // arms the SECOND table (below this blank line), per the "above" trigger

    const secondTable = findAllTables(view.state)[1]!;
    expect(view.state.field(tableDeletionSelectionField)).toBe(secondTable.from);

    dispatchKey(view, 'Delete'); // deletes the second table only
    // The blank line separating them, plus the doc's own original
    // trailing newline (after TABLE2), both remain untouched.
    expect(view.state.doc.toString()).toBe(`${TABLE}\n\n\n`);
    expect(findAllTables(view.state)).toHaveLength(1);
  });

  it('after deleting a middle table, the blank lines above and below it are still ordinary editable lines, not merged or duplicated', () => {
    const doc = `Intro.\n\n${TABLE}\n\nOutro.`;
    const posBelow = `Intro.\n\n${TABLE}\n`.length; // the blank line right after the table
    const { view } = mountRootView(doc, posBelow);

    dispatchKey(view, 'Backspace');
    dispatchKey(view, 'Backspace');

    const finalDoc = view.state.doc.toString();
    expect(finalDoc).toBe('Intro.\n\n\n\nOutro.');
    // Exactly two blank lines remain between "Intro." and "Outro." — the
    // original blank-line gaps on both sides of the now-deleted table,
    // neither merged into one nor left with a stray extra line.
    expect(finalDoc.split('\n')).toEqual(['Intro.', '', '', '', 'Outro.']);
  });
});
