// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { history, undo, redo } from '@codemirror/commands';
import { markdownLanguageExtension } from '../markdownLanguage';
import { tableWidgetDecoration } from './tableWidgetField';
import { tableCellEditor } from '../table-engine/tableCellEditor';
import { tableSelectionHistory } from '../table-engine/tableSelectionHistory';

const mounted: EditorView[] = [];
afterEach(() => { for (const view of mounted.splice(0)) view.destroy(); });
function mountView(doc: string, editable = false): EditorView {
  const view = new EditorView({
    state: EditorState.create({ doc, extensions: [markdownLanguageExtension(), ...(editable ? [tableCellEditor, tableSelectionHistory, history()] : []), tableWidgetDecoration(editable)] }),
    parent: document.body.appendChild(document.createElement('div')),
  });
  mounted.push(view);
  return view;
}
const BASIC_TABLE = '| a | b |\n| - | - |\n| 1 | 2 |';

describe('tableWidgetField — complete document parsing', () => {
  it('keeps a table near the end of a long document in the decoration projection', () => {
    // CodeMirror virtualises off-screen DOM, so a table thousands of lines
    // below the viewport is not expected to have a widget element mounted.
    // Inspect the directly-provided block decoration instead: the table's
    // complete source range must already be replaced in editor state.
    const prefix = Array.from({ length: 2000 }, (_, index) => `Paragraph ${index}`).join('\n\n');
    const tableFrom = prefix.length + 2;
    const tableTo = tableFrom + BASIC_TABLE.length;
    const view = mountView(`${prefix}\n\n${BASIC_TABLE}`);

    const hasTableReplacement = view.state.facet(EditorView.decorations).some((decoration) => {
      const set = typeof decoration === 'function' ? decoration(view) : decoration;
      let found = false;
      set.between(tableFrom, tableTo, (from, to) => {
        if (from === tableFrom && to === tableTo) found = true;
      });
      return found;
    });

    expect(hasTableReplacement).toBe(true);
  });
});

describe('tableWidgetField — basic table', () => {
  it('renders a real <table> element, hiding every pipe delimiter', () => {
    const view = mountView(`${BASIC_TABLE}\n\nOther`);

    expect(view.dom.querySelectorAll('.cm-table-widget')).toHaveLength(1);
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

  it('a WikiLink inside a cell renders the shared unresolved widget', () => {
    const view = mountView('| a |\n| - |\n| [[Page]] |\n\nOther');

    const widget = view.dom.querySelector('tbody td .tok-wikilink');
    expect(widget?.getAttribute('data-wikilink-status')).toBe('unresolved');
    expect(widget?.querySelector('.tok-wikilink__title')?.textContent).toBe('Page');
    expect(widget?.querySelector('.tok-wikilink__icon-wrap svg')).not.toBeNull();
    expect(view.dom.textContent).not.toContain('[[Page]]');
  });
});

describe('tableWidgetField — Setext/Table precedence (no false-positive table decoration)', () => {
  it('an ordinary Setext heading gets no table decoration at all', () => {
    const text = 'Setext Heading\n---\n\nOther';
    const view = mountView(text);

    expect(view.dom.querySelectorAll('.cm-table-widget')).toHaveLength(0);
    expect(view.dom.textContent).toContain('Setext Heading');
  });

  it('a Setext heading whose text line contains a stray "|" still gets no table decoration', () => {
    const text = 'A | B\n---\n\nOther';
    const view = mountView(text);

    expect(view.dom.querySelectorAll('.cm-table-widget')).toHaveLength(0);
    expect(view.dom.textContent).toContain('|');
  });

  it('genuinely table-shaped two-line text (both lines are pipe-delimiter rows) IS decorated as a table', () => {
    const text = 'A|B\n-|-\n\nOther';
    const view = mountView(text);

    expect(view.dom.querySelectorAll('.cm-table-widget')).toHaveLength(1);
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

    const tables = view.dom.querySelectorAll('.cm-table-widget');
    expect(tables).toHaveLength(2);
    expect(tables[0]?.querySelectorAll('td')).toHaveLength(1);
    expect(tables[1]?.querySelectorAll('td')).toHaveLength(2);
    for (const value of ['a', '1', 'x', 'y', '9', '8']) {
      expect(view.dom.textContent).toContain(value);
    }
  });

  it('a non-pipe line directly after a table (no blank line) stays an ordinary paragraph, not a ragged TableRow', () => {
    // Fixed by tableLazyAbsorptionGuard.ts: @lezer/markdown's own Table
    // extension otherwise absorbs any following line — pipe or not — as
    // another TableRow, which diverges from real GFM/GitHub rendering.
    // See that file's doc comment for the full root-cause investigation.
    const text = '| a |\n| - |\n| 1 |\nplain paragraph\n\nOther';
    const view = mountView(text);

    expect(view.dom.querySelectorAll('.cm-table-widget')).toHaveLength(1);
    expect(view.dom.querySelectorAll('tbody tr')).toHaveLength(1); // "1" row only — "plain paragraph" is not part of the table
    expect(view.dom.textContent).toContain('plain paragraph');
  });

  it('a blank line genuinely ends the table — content after it is an ordinary undecorated paragraph', () => {
    const text = '| a |\n| - |\n| 1 |\n\nplain paragraph';
    const view = mountView(text);

    expect(view.dom.querySelectorAll('tbody tr')).toHaveLength(1); // "1" row only
    expect(view.dom.textContent).toContain('plain paragraph');
  });
});

describe('single-engine projection and structural history', () => {
  it('retains all columns through repeated insertions and separate undo and redo', () => {
    const source = '| A | B | C |\n| --- | --- | --- |\n| a | b | c |';
    const view = mountView(source, true);
    const editor = view.plugin(tableCellEditor)!;
    for (let i = 3; i < 10; i++) {
      expect(editor.structural(0, { kind: 'insertColumn', index: i })).toBe(true);
      expect(view.dom.querySelectorAll('thead th')).toHaveLength(i + 1);
    }
    for (let i = 9; i >= 3; i--) {
      expect(undo(view)).toBe(true);
      expect(view.dom.querySelectorAll('thead th')).toHaveLength(i);
    }
    expect(view.state.doc.toString()).toBe(source);
    for (let i = 4; i <= 10; i++) {
      expect(redo(view)).toBe(true);
      expect(view.dom.querySelectorAll('thead th')).toHaveLength(i);
    }
  });
});
