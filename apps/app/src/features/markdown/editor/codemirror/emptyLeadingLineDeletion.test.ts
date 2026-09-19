// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { emptyLeadingLineDeletion } from './emptyLeadingLineDeletion';
import { markdownLanguageExtension } from './markdownLanguage';
import { tableDeletionSelectionField, tableWholeDeletionKeymap } from './table/tableDeletionSelection';
import { findAllTables } from './table/tableGeometry';
import { tableRootSelectionSnap } from './table/tableRootSelectionSnap';
import { tableWidgetDecoration } from './table/tableWidgetField';

/**
 * General editor behavior: Backspace on an empty first line should behave
 * symmetrically with Delete (both merge the empty line away), rather than
 * Backspace being a silent no-op. Mounted via the same minimal,
 * hand-assembled extension set `tableDeletionSelection.test.ts` already
 * uses successfully for real keydown-dispatch tests (rather than the full
 * `buildEditorExtensions()` stack, which has a pre-existing, unrelated
 * jsdom keydown-dispatch quirk affecting unrelated positions — confirmed
 * by reproducing it with this feature's own extension entirely removed,
 * on a table-free document) — this set still includes every extension
 * this feature actually interacts with: `tableWholeDeletionKeymap()` (the
 * `Prec.highest` tie this feature must win at one specific position) and
 * `tableRootSelectionSnap()` (the existing invariant this feature relies
 * on, rather than reimplementing, to keep the root cursor out of a table
 * widget).
 */

const mountedViews: EditorView[] = [];

afterEach(() => {
  for (const view of mountedViews.splice(0)) {
    view.destroy();
  }
});

function mount(doc: string, pos: number): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({
    state: EditorState.create({
      doc,
      selection: EditorSelection.cursor(pos),
      extensions: [
        markdownLanguageExtension(),
        tableWidgetDecoration(),
        tableDeletionSelectionField,
        tableRootSelectionSnap(),
        emptyLeadingLineDeletion(),
        tableWholeDeletionKeymap(),
      ],
    }),
    parent,
  });
  mountedViews.push(view);
  return view;
}

function dispatchKey(view: EditorView, key: string): void {
  view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

const TABLE = '| a | b |\n| - | - |\n| 1 | 2 |';

describe('empty leading line — plain paragraph', () => {
  it('Backspace removes the empty first line, cursor lands at the start of the following text', () => {
    const view = mount('\nHello', 0);

    dispatchKey(view, 'Backspace');

    expect(view.state.doc.toString()).toBe('Hello');
    expect(view.state.selection.main.anchor).toBe(0);
    expect(view.state.selection.main.head).toBe(0);
  });

  it('Delete removes/merges the empty first line the same way', () => {
    const view = mount('\nHello', 0);

    dispatchKey(view, 'Delete');

    expect(view.state.doc.toString()).toBe('Hello');
    expect(view.state.selection.main.anchor).toBe(0);
  });
});

describe('empty leading line — heading', () => {
  it('Backspace removes the empty first line above a heading', () => {
    const view = mount('\n# Heading', 0);

    dispatchKey(view, 'Backspace');

    expect(view.state.doc.toString()).toBe('# Heading');
    expect(view.state.selection.main.anchor).toBe(0);
  });
});

describe('empty leading line — list', () => {
  it('Backspace removes the empty first line above a list item', () => {
    const view = mount('\n- Item', 0);

    dispatchKey(view, 'Backspace');

    expect(view.state.doc.toString()).toBe('- Item');
    expect(view.state.selection.main.anchor).toBe(0);
  });
});

describe('empty leading line — table', () => {
  it('Backspace removes only the empty line; the table remains, byte-for-byte', () => {
    const doc = `\n${TABLE}\n`;
    const view = mount(doc, 0);

    dispatchKey(view, 'Backspace');

    expect(view.state.doc.toString()).toBe(`${TABLE}\n`);
    const table = findAllTables(view.state)[0]!;
    expect(view.state.sliceDoc(table.from, table.to)).toBe(TABLE);
  });

  it('Delete removes/merges only the empty line; the table remains, byte-for-byte', () => {
    const doc = `\n${TABLE}\n`;
    const view = mount(doc, 0);

    dispatchKey(view, 'Delete');

    expect(view.state.doc.toString()).toBe(`${TABLE}\n`);
    const table = findAllTables(view.state)[0]!;
    expect(view.state.sliceDoc(table.from, table.to)).toBe(TABLE);
  });

  it('after either key, the root selection never rests inside or at the boundary of the table widget', () => {
    for (const key of ['Backspace', 'Delete']) {
      const doc = `\n${TABLE}\n`;
      const view = mount(doc, 0);

      dispatchKey(view, key);

      const table = findAllTables(view.state)[0]!;
      const sel = view.state.selection.main;
      expect(sel.empty).toBe(true);
      const pos = sel.head;
      expect(pos < table.from || pos > table.to).toBe(true);
      view.destroy();
    }
  });

  it('table-only document (nothing after it either): the line is removed and the cursor lands safely outside the table', () => {
    const view = mount(`\n${TABLE}`, 0);

    dispatchKey(view, 'Backspace');

    expect(view.state.doc.toString()).toBe(TABLE);
    const table = findAllTables(view.state)[0]!;
    expect(view.state.sliceDoc(table.from, table.to)).toBe(TABLE);
    // `table.to` here is document end with nothing following at all —
    // `tableRootSelectionSnap.ts`'s own documented, already-established
    // rule for that specific case ("there is no further position to move
    // to"), not a violation of the "never inside the widget" invariant.
    // The point this test actually verifies is that the cursor was moved
    // *out* of the deleted-into interior (`table.from`, which a naive
    // forward-merge would otherwise leave it resting at) rather than left
    // there uncorrected.
    const pos = view.state.selection.main.head;
    expect(pos).toBe(table.to);
  });
});

describe('regression — unrelated Backspace/Delete behavior is unaffected', () => {
  it('a non-empty first line still does nothing on Backspace at position 0 (unchanged default)', () => {
    const doc = 'Hello\nWorld';
    const view = mount(doc, 0);

    dispatchKey(view, 'Backspace');

    expect(view.state.doc.toString()).toBe(doc);
  });

  it('a single-line document (nothing to merge with) is unaffected by this fix even though the line is empty', () => {
    const view = mount('', 0);

    dispatchKey(view, 'Backspace');

    expect(view.state.doc.toString()).toBe('');
  });
});

describe('regression — existing table Backspace/Delete atomic (arm + delete) behavior is unchanged', () => {
  it('Backspace from the blank line below a table still requires two presses to delete the whole table', () => {
    const doc = `${TABLE}\n`;
    const view = mount(doc, doc.length);

    dispatchKey(view, 'Backspace');
    expect(view.state.field(tableDeletionSelectionField)).toBe(0); // table.from
    expect(view.state.doc.toString()).toBe(doc);

    dispatchKey(view, 'Backspace');
    // deleteTable only removes [table.from, table.to) — the trailing
    // blank line's own newline (already present before the table's own
    // range) is untouched, exactly as before this feature existed.
    expect(view.state.doc.toString()).toBe('\n');
  });

  it('Delete from the end of real content immediately above a table still arms it (unaffected by this fix, since that line is non-empty)', () => {
    const doc = `Above.\n${TABLE}`;
    const pos = doc.indexOf('Above.') + 'Above.'.length;
    const view = mount(doc, pos);

    dispatchKey(view, 'Delete');

    const table = findAllTables(view.state)[0]!;
    expect(view.state.field(tableDeletionSelectionField)).toBe(table.from);
    expect(view.state.doc.toString()).toBe(doc);

    dispatchKey(view, 'Delete');
    expect(view.state.doc.toString()).toBe('Above.\n');
  });
});
