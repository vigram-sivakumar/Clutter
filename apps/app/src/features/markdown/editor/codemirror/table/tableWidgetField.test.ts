// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { TableActiveCellController } from './tableActiveCellController';
import { tableWidgetDecoration } from './tableWidgetField';

function mountView(doc: string, controller?: TableActiveCellController): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    extensions: [markdownLanguageExtension(), tableWidgetDecoration(controller)],
  });
  return new EditorView({ state, parent });
}

const BASIC_TABLE = '| a | b |\n| - | - |\n| 1 | 2 |';

describe('tableWidgetField — basic table', () => {
  it('renders a real <table> element, hiding every pipe delimiter', () => {
    const view = mountView(`${BASIC_TABLE}\n\nOther`);

    expect(view.dom.querySelectorAll('table.cm-table-widget')).toHaveLength(1);
    expect(view.dom.textContent).not.toContain('|');
    for (const value of ['a', 'b', '1', '2']) {
      expect(view.dom.textContent).toContain(value);
    }
  });

  it('renders the header row inside <thead> and the data row inside <tbody>', () => {
    const view = mountView(BASIC_TABLE);

    expect(view.dom.querySelectorAll('thead tr')).toHaveLength(1);
    expect(view.dom.querySelectorAll('thead th')).toHaveLength(2);
    expect(view.dom.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(view.dom.querySelectorAll('tbody td')).toHaveLength(2);
  });
});

describe('tableWidgetField — multiple rows and columns', () => {
  it('decorates every row and every column across a larger table', () => {
    const text = '| a | b | c |\n| - | - | - |\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |\n| 7 | 8 | 9 |\n\nOther';
    const view = mountView(text);

    expect(view.dom.querySelectorAll('tbody tr')).toHaveLength(3);
    expect(view.dom.querySelectorAll('tbody td')).toHaveLength(9);
    expect(view.dom.textContent).not.toContain('|');
    for (const value of ['a', 'b', 'c', '1', '2', '3', '4', '5', '6', '7', '8', '9']) {
      expect(view.dom.textContent).toContain(value);
    }
  });
});

describe('tableWidgetField — column alignment', () => {
  it('applies left/center/right alignment classes to the correct columns', () => {
    const text = '| a | b | c |\n| :--- | :---: | ---: |\n| 1 | 2 | 3 |\n\nOther';
    const view = mountView(text);

    const headerCells = Array.from(view.dom.querySelectorAll('thead th'));
    expect(headerCells[0]?.classList.contains('cm-table-widget-align-left')).toBe(true);
    expect(headerCells[1]?.classList.contains('cm-table-widget-align-center')).toBe(true);
    expect(headerCells[2]?.classList.contains('cm-table-widget-align-right')).toBe(true);
  });

  it('an unaligned column (plain "---") gets no alignment class', () => {
    const text = '| a |\n| --- |\n| 1 |\n\nOther';
    const view = mountView(text);

    const cell = view.dom.querySelector('thead th');
    expect(cell?.classList.contains('cm-table-widget-align-left')).toBe(false);
    expect(cell?.classList.contains('cm-table-widget-align-center')).toBe(false);
    expect(cell?.classList.contains('cm-table-widget-align-right')).toBe(false);
  });

  it('alignment applies consistently to every row in the column, not just the header', () => {
    const text = '| a |\n| ---: |\n| 1 |\n| 2 |\n\nOther';
    const view = mountView(text);

    const cells = Array.from(view.dom.querySelectorAll('th, td'));
    expect(cells).toHaveLength(3); // header + 2 data rows
    expect(cells.every((c) => c.classList.contains('cm-table-widget-align-right'))).toBe(true);
  });
});

describe('tableWidgetField — the document is always authoritative', () => {
  it('the stored document text is unaffected by decoration', () => {
    const view = mountView(BASIC_TABLE);

    expect(view.state.doc.toString()).toBe(BASIC_TABLE);
  });

  it('editing a cell\'s text produces the expected new Markdown source, decorations aside', () => {
    const view = mountView('| a | b |\n| - | - |\n| 1 | 2 |');
    const cellStart = view.state.doc.toString().indexOf('1');

    view.dispatch({ changes: { from: cellStart, to: cellStart + 1, insert: '99' } });

    expect(view.state.doc.toString()).toBe('| a | b |\n| - | - |\n| 99 | 2 |');
    expect(view.dom.textContent).toContain('99');
  });
});

describe('tableWidgetField — inactive cells render formatted (not plain-text) Markdown', () => {
  it('bold text inside a cell renders as <strong>, with its ** markers hidden', () => {
    const view = mountView('| a |\n| - |\n| **bold** |\n\nOther');

    expect(view.dom.querySelector('tbody td strong')?.textContent).toBe('bold');
    expect(view.dom.textContent).not.toContain('**');
  });

  it('a WikiLink inside a cell renders via renderInlineMarkdown', () => {
    const view = mountView('| a |\n| - |\n| [[Page]] |\n\nOther');

    expect(view.dom.querySelector('tbody td .cm-table-cell-wikilink')?.textContent).toBe('Page');
  });
});

describe('tableWidgetField — Setext/Table precedence (no false-positive table decoration)', () => {
  it('an ordinary Setext heading gets no table decoration at all', () => {
    const text = 'Setext Heading\n---\n\nOther';
    const view = mountView(text);

    expect(view.dom.querySelectorAll('table.cm-table-widget')).toHaveLength(0);
    expect(view.dom.textContent).toContain('Setext Heading');
  });

  it('a Setext heading whose text line contains a stray "|" still gets no table decoration', () => {
    const text = 'A | B\n---\n\nOther';
    const view = mountView(text);

    expect(view.dom.querySelectorAll('table.cm-table-widget')).toHaveLength(0);
    expect(view.dom.textContent).toContain('|');
  });

  it('genuinely table-shaped two-line text (both lines are pipe-delimiter rows) IS decorated as a table', () => {
    const text = 'A|B\n-|-\n\nOther';
    const view = mountView(text);

    expect(view.dom.querySelectorAll('table.cm-table-widget')).toHaveLength(1);
    expect(view.dom.textContent).not.toContain('|');
  });

  it('a row with no leading/trailing pipe still produces every cell (GFM: outer pipes are optional)', () => {
    const text = 'A|B\n-|-\n1|2\n\nOther';
    const view = mountView(text);

    const headerCells = view.dom.querySelectorAll('thead th');
    expect(headerCells).toHaveLength(2);
    expect(headerCells[0]?.textContent).toBe('A');
    expect(headerCells[1]?.textContent).toBe('B');
    const bodyCells = view.dom.querySelectorAll('tbody td');
    expect(bodyCells[0]?.textContent).toBe('1');
    expect(bodyCells[1]?.textContent).toBe('2');
  });
});

describe('tableWidgetField — nested/adjacent tables', () => {
  it('two tables separated by a blank line each decorate independently, with the correct row/cell counts', () => {
    const text = '| a |\n| - |\n| 1 |\n\n| x | y |\n| - | - |\n| 9 | 8 |\n\nOther';
    const view = mountView(text);

    const tables = view.dom.querySelectorAll('table.cm-table-widget');
    expect(tables).toHaveLength(2);
    expect(tables[0]?.querySelectorAll('td')).toHaveLength(1);
    expect(tables[1]?.querySelectorAll('td')).toHaveLength(2);
    for (const value of ['a', '1', 'x', 'y', '9', '8']) {
      expect(view.dom.textContent).toContain(value);
    }
  });

  it('a non-pipe line directly after a table (no blank line) is absorbed as a one-cell TableRow, not left as a separate paragraph', () => {
    // Confirmed empirically (carried over from tableDecoration.test.ts):
    // a table leaf block only ends at a blank line or EOF, not at the
    // first line lacking a "|" — GFM's own spec-mandated behavior.
    const text = '| a |\n| - |\n| 1 |\nplain paragraph\n\nOther';
    const view = mountView(text);

    expect(view.dom.querySelectorAll('table.cm-table-widget')).toHaveLength(1);
    expect(view.dom.querySelectorAll('tbody tr')).toHaveLength(2); // "1" row, "plain paragraph" row
    expect(view.dom.textContent).toContain('plain paragraph');
  });

  it('a blank line genuinely ends the table — content after it is an ordinary undecorated paragraph', () => {
    const text = '| a |\n| - |\n| 1 |\n\nplain paragraph';
    const view = mountView(text);

    expect(view.dom.querySelectorAll('tbody tr')).toHaveLength(1); // "1" row only
    expect(view.dom.textContent).toContain('plain paragraph');
  });
});

describe('tableWidgetField — controller.remapActiveAnchor wiring (M2)', () => {
  it('calls controller.remapActiveAnchor synchronously on every doc-changing transaction, before this field rebuilds its own decorations', () => {
    const controller = new TableActiveCellController();
    const view = mountView(BASIC_TABLE, controller);
    controller.activate(view, document.createElement('div'), 2, 3, 2); // "a"

    view.dispatch({ changes: { from: 0, to: 0, insert: 'XX' } });

    // Anchor shifted by the 2-character insert at the very start — proof
    // remapActiveAnchor actually ran as part of this same transaction,
    // not merely that activate() itself still holds its original values.
    expect(controller.activeAnchor).toEqual({ from: 4, to: 5 });
  });

  it('never calls remapActiveAnchor for a selection-only transaction (no doc change to remap through)', () => {
    const controller = new TableActiveCellController();
    const view = mountView(BASIC_TABLE, controller);
    controller.activate(view, document.createElement('div'), 2, 3, 2);
    const before = controller.activeAnchor;

    view.dispatch({ selection: { anchor: 0 } });

    expect(controller.activeAnchor).toEqual(before);
  });

  it('rendering still works correctly with no controller supplied at all (backward-compatible default)', () => {
    const view = mountView(BASIC_TABLE);

    expect(view.dom.querySelectorAll('table.cm-table-widget')).toHaveLength(1);
  });
});
