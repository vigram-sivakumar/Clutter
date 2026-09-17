// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { createInlineLivePreviewParticipants } from '../highlight/inlineLivePreviewParticipants';
import { inlineLivePreviewRegion } from '../highlight/inlineLivePreviewRegion';
import { markdownLanguageExtension } from '../markdownLanguage';
import { wikiLinkLivePreview } from '../wikilink/wikiLinkLivePreview';
import { tableDecoration } from './tableDecoration';
import { tableEnterKeymap } from './tableEnterKeymap';

const noResolvers = { resolveTag: () => undefined, resolveDate: () => undefined };

/**
 * What a user actually sees — see inlineLivePreviewRegion.test.ts's own
 * `visibleText` doc comment for the full rationale. Needed here because a
 * migrated construct (bold) can appear inside a table cell, and its
 * concealed marker (`cm-marker--concealed`) is a widget with no text of
 * its own (see inlineLivePreviewRegion.test.ts's `visibleText` comment).
 */
function visibleText(target: EditorView | Node | null | undefined): string {
  if (!target) {
    return '';
  }
  const root: Node = 'dom' in target ? target.dom : target;
  let result = '';
  const walk = (node: Node) => {
    if (node.nodeType === Node.ELEMENT_NODE && (node as Element).classList.contains('cm-marker--concealed')) {
      return;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      result += node.textContent ?? '';
      return;
    }
    node.childNodes.forEach(walk);
  };
  walk(root);
  return result;
}

/** Mirrors listMarkerDecoration.test.ts's mountView — see its doc comment for why `initialAnchor` matters for "at rest" tests. */
function mountView(doc: string, initialAnchor: number | null = null): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    selection: initialAnchor === null ? undefined : { anchor: initialAnchor },
    extensions: [markdownLanguageExtension(), tableDecoration()],
  });
  return new EditorView({ state, parent });
}

/** Same as mountView, plus the semantic-token decorations needed to verify composition inside a cell. */
function mountViewWithSemanticTokens(doc: string, initialAnchor: number | null = null): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    selection: initialAnchor === null ? undefined : { anchor: initialAnchor },
    extensions: [
      markdownLanguageExtension(),
      tableDecoration(),
      inlineLivePreviewRegion(createInlineLivePreviewParticipants(noResolvers)),
      wikiLinkLivePreview(() => undefined),
    ],
  });
  return new EditorView({ state, parent });
}

const BASIC_TABLE = '| a | b |\n| - | - |\n| 1 | 2 |';

describe('tableDecoration — basic table', () => {
  it('at rest, hides the pipe delimiters — none appear in the rendered text', () => {
    const text = `${BASIC_TABLE}\n\nOther`;
    const view = mountView(text, text.indexOf('Other'));

    expect(view.dom.textContent).not.toContain('|');
    expect(view.dom.textContent).toContain('a');
    expect(view.dom.textContent).toContain('b');
    expect(view.dom.textContent).toContain('1');
    expect(view.dom.textContent).toContain('2');
  });

  it('applies display:table-row to every row line, including the header', () => {
    const text = `${BASIC_TABLE}\n\nOther`;
    const view = mountView(text, text.indexOf('Other'));

    const rows = view.dom.querySelectorAll('.cm-table-row');
    expect(rows).toHaveLength(3); // header + alignment row + one data row
  });

  it('applies the header class only to the first row', () => {
    const text = `${BASIC_TABLE}\n\nOther`;
    const view = mountView(text, text.indexOf('Other'));

    expect(view.dom.querySelectorAll('.cm-table-header')).toHaveLength(1);
  });

  it('applies display:table-cell to every data cell', () => {
    const text = `${BASIC_TABLE}\n\nOther`;
    const view = mountView(text, text.indexOf('Other'));

    // header (a, b) + data row (1, 2) = 4 cells; the alignment row has none.
    expect(view.dom.querySelectorAll('.cm-table-cell')).toHaveLength(4);
  });
});

describe('tableDecoration — multiple rows and columns', () => {
  it('decorates every row and every column across a larger table', () => {
    const text = '| a | b | c |\n| - | - | - |\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |\n| 7 | 8 | 9 |\n\nOther';
    const view = mountView(text, text.indexOf('Other'));

    // header + alignment + 3 data rows
    expect(view.dom.querySelectorAll('.cm-table-row')).toHaveLength(5);
    // 3 columns × 4 content rows (header + 3 data rows)
    expect(view.dom.querySelectorAll('.cm-table-cell')).toHaveLength(12);
    expect(view.dom.textContent).not.toContain('|');
    for (const value of ['a', 'b', 'c', '1', '2', '3', '4', '5', '6', '7', '8', '9']) {
      expect(view.dom.textContent).toContain(value);
    }
  });
});

describe('tableDecoration — column alignment', () => {
  it('applies left/center/right alignment classes to the correct columns', () => {
    const text = '| a | b | c |\n| :--- | :---: | ---: |\n| 1 | 2 | 3 |\n\nOther';
    const view = mountView(text, text.indexOf('Other'));

    const cells = Array.from(view.dom.querySelectorAll('.cm-table-cell'));
    const headerCells = cells.slice(0, 3);
    expect(headerCells[0]?.classList.contains('cm-table-align-left')).toBe(true);
    expect(headerCells[1]?.classList.contains('cm-table-align-center')).toBe(true);
    expect(headerCells[2]?.classList.contains('cm-table-align-right')).toBe(true);
  });

  it('an unaligned column (plain "---") gets no alignment class', () => {
    const text = '| a |\n| --- |\n| 1 |\n\nOther';
    const view = mountView(text, text.indexOf('Other'));

    const cell = view.dom.querySelector('.cm-table-cell');
    expect(cell?.classList.contains('cm-table-align-left')).toBe(false);
    expect(cell?.classList.contains('cm-table-align-center')).toBe(false);
    expect(cell?.classList.contains('cm-table-align-right')).toBe(false);
  });

  it('alignment applies consistently to every row in the column, not just the header', () => {
    const text = '| a |\n| ---: |\n| 1 |\n| 2 |\n\nOther';
    const view = mountView(text, text.indexOf('Other'));

    const cells = Array.from(view.dom.querySelectorAll('.cm-table-cell'));
    expect(cells).toHaveLength(3); // header + 2 data rows
    expect(cells.every((c) => c.classList.contains('cm-table-align-right'))).toBe(true);
  });
});

describe('tableDecoration — pipes stay hidden regardless of cursor position (frozen UX: always a rendered table)', () => {
  it('cursor inside a data row does not reveal that row\'s own "|"', () => {
    const text = '| a | b |\n| - | - |\n| 1 | 2 |\n| 3 | 4 |';
    const thirdRowStart = text.indexOf('| 3');
    const view = mountView(text, thirdRowStart + 2); // inside "3"

    expect(view.dom.textContent).not.toContain('|');
    const rows = view.dom.querySelectorAll('.cm-table-row');
    expect(rows).toHaveLength(4); // header, alignment, row1, row2 — all still table-rows
  });

  it('cursor inside the header row does not reveal any row\'s "|"', () => {
    const text = '| a | b |\n| - | - |\n| 1 | 2 |';
    const view = mountView(text, 2); // inside "a", the header row

    expect(view.dom.textContent).not.toContain('|');
    expect(view.dom.textContent).toContain('a');
    expect(view.dom.textContent).toContain('1');
  });

  it('stays collapsed identically whether the selection is inside the table or has moved away', () => {
    const text = '| a | b |\n| - | - |\n| 1 | 2 |\n\nOther';
    const dataRowStart = text.indexOf('| 1');
    const view = mountView(text, dataRowStart + 2); // inside "1"

    expect(view.dom.textContent).not.toContain('|');

    view.dispatch({ selection: { anchor: text.indexOf('Other') } });

    expect(view.dom.textContent).not.toContain('|');
    expect(view.dom.textContent).toContain('1');
  });
});

describe('tableDecoration — alignment/separator row', () => {
  it('the alignment row is hidden at rest — no dashes or colons appear anywhere', () => {
    const text = '| a | b |\n| :--- | ---: |\n| 1 | 2 |\n\nOther';
    const view = mountView(text, text.indexOf('Other'));

    expect(view.dom.textContent).not.toContain('-');
    expect(view.dom.textContent).not.toContain(':');
  });

  it('the alignment row still carries the table-row class at rest (keeps the grid contiguous)', () => {
    const text = '| a | b |\n| :--- | ---: |\n| 1 | 2 |\n\nOther';
    const view = mountView(text, text.indexOf('Other'));

    const alignRow = view.dom.querySelector('.cm-table-align-row');
    expect(alignRow).not.toBeNull();
    expect(alignRow?.classList.contains('cm-table-row')).toBe(true);
  });

  it('stays hidden even when the cursor is on the alignment row itself — it is structural syntax, never user data', () => {
    const text = '| a | b |\n| :--- | ---: |\n| 1 | 2 |';
    const alignRowStart = text.indexOf(':---');
    const view = mountView(text, alignRowStart);

    expect(view.dom.textContent).not.toContain('-');
    expect(view.dom.textContent).not.toContain(':');
  });
});

describe('tableDecoration — the document is always authoritative', () => {
  it('the stored document text never changes as rows collapse/reveal', () => {
    const view = mountView(BASIC_TABLE);

    expect(view.state.doc.toString()).toBe(BASIC_TABLE);
    view.dispatch({ selection: { anchor: 2 } });
    expect(view.state.doc.toString()).toBe(BASIC_TABLE);
    view.dispatch({ selection: { anchor: 0 } });
    expect(view.state.doc.toString()).toBe(BASIC_TABLE);
  });

  it('editing a cell\'s text produces the expected new Markdown source, decorations aside', () => {
    const view = mountView('| a | b |\n| - | - |\n| 1 | 2 |', 0);
    const cellStart = view.state.doc.toString().indexOf('1');

    view.dispatch({ changes: { from: cellStart, to: cellStart + 1, insert: '99' } });

    expect(view.state.doc.toString()).toBe('| a | b |\n| - | - |\n| 99 | 2 |');
  });
});

describe('tableDecoration — semantic tokens compose inside cells', () => {
  it('WikiLink/Tag/Date/emphasis all still decorate correctly inside a table cell', () => {
    const text = '| a | b |\n| - | - |\n| [[Page]] | #tag |\n\nOther';
    const view = mountViewWithSemanticTokens(text, text.indexOf('Other'));

    expect(view.dom.querySelector('.tok-wikilink')).not.toBeNull();
    expect(view.dom.querySelector('.tok-tag')).not.toBeNull();
    // The table's own pipe-hiding still applies alongside the semantic tokens.
    expect(view.dom.textContent).not.toContain('|');
  });

  it('bold text inside a cell still hides its ** markers at rest', () => {
    const text = '| a |\n| - |\n| **bold** |\n\nOther';
    const view = mountViewWithSemanticTokens(text, text.indexOf('Other'));

    expect(visibleText(view)).toContain('bold');
    expect(visibleText(view)).not.toContain('**');
  });

  it('a Date token inside a cell resolves independently of the table decoration', () => {
    const text = '| a |\n| - |\n| @2026-08-21 |\n\nOther';
    const view = mountViewWithSemanticTokens(text, text.indexOf('Other'));

    expect(view.dom.querySelector('.tok-date')).not.toBeNull();
  });

  // ===================================================================
  // DOM containment (not merely "the class appears somewhere"). Same class
  // of regression the heading fix addressed: TableCell's own mark and
  // inlineLivePreviewRegion's/wikiLinkLivePreview's marks are independent
  // decoration sources, so without inclusiveStart/inclusiveEnd on
  // TableCell's mark plus correct precedence (see tableDecoration.ts's own
  // doc comment on `cellClass`/`tableDecoration`), these split or dropped
  // the cell class entirely instead of nesting — confirmed empirically
  // before the fix. Deliberately exact-range-coincidence cases (the cell's
  // ENTIRE content is one construct), the shape that broke without the fix.
  // ===================================================================
  describe('cm-table-cell correctly wraps a nested construct (no split, no dropped class)', () => {
    it('| **Bold** |: cm-table-cell is the outer span, tok-strong nests inside it', () => {
      const text = '| a |\n| - |\n| **Bold** |\n\nOther';
      const view = mountViewWithSemanticTokens(text, text.indexOf('Other'));

      const cell = view.dom.querySelector('.cm-table-row:not(.cm-table-header) .cm-table-cell');
      expect(cell).not.toBeNull();
      const inner = cell?.querySelector('.tok-strong');
      expect(inner).not.toBeNull();
      expect(inner?.textContent).toBe('Bold');
      // Not a sibling split: exactly one cm-table-cell, not one per side.
      expect(view.dom.querySelectorAll('.cm-table-cell').length).toBe(2); // header cell "a" + this cell
    });

    it('| ==highlight== |: cm-table-cell is the outer span, tok-highlight nests inside it', () => {
      const text = '| a |\n| - |\n| ==highlight== |\n\nOther';
      const view = mountViewWithSemanticTokens(text, text.indexOf('Other'));

      const cell = view.dom.querySelector('.cm-table-row:not(.cm-table-header) .cm-table-cell');
      expect(cell).not.toBeNull();
      const inner = cell?.querySelector('.tok-highlight');
      expect(inner).not.toBeNull();
      expect(inner?.textContent).toBe('highlight');
    });

    it('| [[Page]] |: cm-table-cell is the outer span, the WikiLink widget nests inside it (not dropped)', () => {
      const text = '| a |\n| - |\n| [[Page]] |\n\nOther';
      const view = mountViewWithSemanticTokens(text, text.indexOf('Other'));

      const cell = view.dom.querySelector('.cm-table-row:not(.cm-table-header) .cm-table-cell');
      expect(cell).not.toBeNull();
      const inner = cell?.querySelector('.tok-wikilink');
      expect(inner).not.toBeNull();
      expect(inner?.textContent).toBe('Page');
    });

    it('document text is never mutated by the cell/inline-construct composition', () => {
      const text = '| a |\n| - |\n| **Bold** |';
      const view = mountViewWithSemanticTokens(text);

      expect(view.state.doc.toString()).toBe(text);
    });
  });
});

describe('tableDecoration — Setext/Table precedence (no false-positive table decoration)', () => {
  it('an ordinary Setext heading gets no table decoration at all', () => {
    const text = 'Setext Heading\n---\n\nOther';
    const view = mountView(text, text.indexOf('Other'));

    expect(view.dom.querySelectorAll('.cm-table-row')).toHaveLength(0);
    expect(view.dom.textContent).toContain('Setext Heading');
  });

  it('a Setext heading whose text line contains a stray "|" still gets no table decoration', () => {
    const text = 'A | B\n---\n\nOther';
    const view = mountView(text, text.indexOf('Other'));

    expect(view.dom.querySelectorAll('.cm-table-row')).toHaveLength(0);
    // Not a table, so the "|" is ordinary text and must remain visible.
    expect(view.dom.textContent).toContain('|');
  });

  it('genuinely table-shaped two-line text (both lines are pipe-delimiter rows) IS decorated as a table', () => {
    const text = 'A|B\n-|-\n\nOther';
    const view = mountView(text, text.indexOf('Other'));

    expect(view.dom.querySelectorAll('.cm-table-row').length).toBeGreaterThan(0);
    expect(view.dom.textContent).not.toContain('|');
  });
});

describe('tableDecoration — nested/adjacent tables', () => {
  it('two tables separated by a blank line each decorate independently, with the correct row/cell counts', () => {
    const text = '| a |\n| - |\n| 1 |\n\n| x | y |\n| - | - |\n| 9 | 8 |\n\nOther';
    const view = mountView(text, text.indexOf('Other'));

    // Table 1: header + alignment + 1 data row = 3 rows, 2 cells.
    // Table 2: header + alignment + 1 data row = 3 rows, 4 cells.
    expect(view.dom.querySelectorAll('.cm-table-row')).toHaveLength(6);
    expect(view.dom.querySelectorAll('.cm-table-cell')).toHaveLength(6);
    expect(view.dom.querySelectorAll('.cm-table-header')).toHaveLength(2);
    for (const value of ['a', '1', 'x', 'y', '9', '8']) {
      expect(view.dom.textContent).toContain(value);
    }
  });

  it('cursor in the second table\'s row does not reveal pipes in either table', () => {
    const text = '| a |\n| - |\n| 1 |\n\n| x |\n| - |\n| 9 |';
    const secondTableDataRow = text.lastIndexOf('| 9');
    const view = mountView(text, secondTableDataRow + 2);

    expect(view.dom.textContent).not.toContain('|');
    expect(view.dom.textContent).toContain('9');
    expect(view.dom.textContent).toContain('1');
  });

  it('a non-pipe line directly after a table (no blank line) is absorbed as a one-cell TableRow, not left as a separate paragraph', () => {
    // Confirmed empirically against the installed @lezer/markdown: a table
    // leaf block only ends at a blank line or EOF, not at the first line
    // that lacks a "|" — GFM's own spec-mandated behavior, not a Clutter
    // choice. "plain paragraph" therefore decorates as an ordinary
    // (columnless) table row, not as an undecorated paragraph.
    const text = '| a |\n| - |\n| 1 |\nplain paragraph\n\nOther';
    const view = mountView(text, text.indexOf('Other'));

    expect(view.dom.querySelectorAll('.cm-table-row')).toHaveLength(4); // header, alignment, "1" row, "plain paragraph" row
    expect(view.dom.textContent).toContain('plain paragraph');
  });

  it('a blank line genuinely ends the table — content after it is an ordinary undecorated paragraph', () => {
    const text = '| a |\n| - |\n| 1 |\n\nplain paragraph';
    const view = mountView(text, text.indexOf('plain'));

    expect(view.dom.querySelectorAll('.cm-table-row')).toHaveLength(3); // header, alignment, "1" row only
    expect(view.dom.textContent).toContain('plain paragraph');
  });
});

describe('tableDecoration — a row created by tableEnterKeymap renders immediately, in the same update', () => {
  /** Real production stack (decoration + the Enter guard together), not tableDecoration() in isolation — the reported bug only shows up when a keymap-driven transaction creates a new row, not when a document is mounted with one already in it. */
  function mountEditableView(doc: string, anchor: number): EditorView {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const state = EditorState.create({
      doc,
      selection: { anchor },
      extensions: [markdownLanguageExtension(), tableDecoration(), tableEnterKeymap()],
    });
    return new EditorView({ state, parent });
  }

  function dispatchEnter(view: EditorView): void {
    view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  }

  it('Enter in a data cell — the new row is a rendered table row with real, styled cells immediately, no further input needed', () => {
    const doc = '| Name | Role |\n| --- | --- |\n| Vik | Designer |';
    const view = mountEditableView(doc, doc.indexOf('Vik') + 1);

    dispatchEnter(view);

    expect(view.state.doc.toString()).toBe(doc + '\n| | |');
    const rows = view.dom.querySelectorAll('.cm-table-row');
    expect(rows).toHaveLength(4); // header, alignment, "Vik" row, the new row
    // 3 cell-bearing rows x 2 columns = 6. The bug: the new row's two empty
    // columns got no `.cm-table-cell` at all until typed into (would be 4).
    expect(view.dom.querySelectorAll('.cm-table-cell')).toHaveLength(6);
    expect(view.dom.textContent).not.toContain('|');
  });

  it('Enter in a header cell — the inserted row is a rendered table row with real, styled cells immediately', () => {
    const doc = '| Name | Role |\n| --- | --- |\n| Vik | Designer |';
    const view = mountEditableView(doc, doc.indexOf('Name') + 1);

    dispatchEnter(view);

    const rows = view.dom.querySelectorAll('.cm-table-row');
    expect(rows).toHaveLength(4);
    expect(view.dom.querySelectorAll('.cm-table-cell')).toHaveLength(6); // 3 rows x 2 columns
    expect(view.dom.textContent).not.toContain('|');
  });

  it('Enter with an empty current cell — the inserted row is a rendered table row with real, styled cells immediately', () => {
    const doc = '| A | |\n| --- | --- |\n| 1 | |';
    const emptyCellPos = doc.lastIndexOf('| |') + 2;
    const view = mountEditableView(doc, emptyCellPos);

    dispatchEnter(view);

    expect(view.state.doc.toString()).toBe(doc + '\n| | |');
    const rows = view.dom.querySelectorAll('.cm-table-row');
    expect(rows).toHaveLength(4);
    // 3 rows x 2 columns = 6 `.cm-table-cell` boxes total — every column
    // gets one now, whether or not it has a `TableCell` node behind it.
    expect(view.dom.querySelectorAll('.cm-table-cell')).toHaveLength(6);
    expect(view.dom.textContent).not.toContain('|');
  });

  it('existing table rendering is unaffected — same row/cell counts as before this fix', () => {
    const doc = '| a | b |\n| - | - |\n| 1 | 2 |';
    const view = mountEditableView(doc, 0);

    expect(view.dom.querySelectorAll('.cm-table-row')).toHaveLength(3);
    expect(view.dom.querySelectorAll('.cm-table-cell')).toHaveLength(4);
    expect(view.dom.textContent).not.toContain('|');
  });
});

describe('tableDecoration — empty logical cells render as real table cells (no TableCell node required)', () => {
  it('1. a directly-authored fully-empty row ("| | |") renders every column as a styled cell', () => {
    const text = '| a | b |\n| - | - |\n| | |\n\nOther';
    const view = mountView(text, text.indexOf('Other'));

    const rows = Array.from(view.dom.querySelectorAll('.cm-table-row'));
    const dataRow = rows[2]; // header, alignment, then the empty data row
    expect(dataRow?.querySelectorAll('.cm-table-cell')).toHaveLength(2);
    expect(view.dom.textContent).not.toContain('|');
  });

  it('2. an Enter-created empty row renders every column as a styled cell in the same transaction', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const doc = '| a | b |\n| - | - |\n| 1 | 2 |';
    const state = EditorState.create({
      doc,
      selection: { anchor: doc.indexOf('1') },
      extensions: [markdownLanguageExtension(), tableDecoration(), tableEnterKeymap()],
    });
    const view = new EditorView({ state, parent });

    view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));

    expect(view.state.doc.toString()).toBe(doc + '\n| | |');
    const rows = Array.from(view.dom.querySelectorAll('.cm-table-row'));
    const newRow = rows[3];
    expect(newRow?.querySelectorAll('.cm-table-cell')).toHaveLength(2);
  });

  it('3. a partially-empty row still decorates the populated cell and the empty cell as a styled cell, each spanning its own full delimiter-bounded gap', () => {
    const text = '| a | b |\n| - | - |\n| Tom | |\n\nOther';
    const view = mountView(text, text.indexOf('Other'));

    const rows = Array.from(view.dom.querySelectorAll('.cm-table-row'));
    const dataRow = rows[2];
    const cells = dataRow?.querySelectorAll('.cm-table-cell') ?? [];
    expect(cells).toHaveLength(2);
    // Every column's mark spans the *whole* gap between its two delimiters
    // (`| Tom |` → " Tom ", padding included) — not just a populated
    // cell's own trimmed content — per the caret-anchoring fix below: see
    // this file's own `decorateRow` doc comment (anonymous-table-cell
    // rationale).
    expect(cells[0]?.textContent).toBe(' Tom ');
    // The empty cell's decoration spans its whole delimiter-bounded gap
    // (there's no trimmed "content" range for an empty cell) — here that's
    // exactly the one literal space between the two pipes.
    expect(cells[1]?.textContent).toBe(' ');
  });

  it('4. populated cells now include their own leading/trailing padding in the same mark as their content (the caret-anchoring fix) — same class, same cell count, no regression', () => {
    const text = '| a | b |\n| - | - |\n| 1 | 2 |\n\nOther';
    const view = mountView(text, text.indexOf('Other'));

    const cells = Array.from(view.dom.querySelectorAll('.cm-table-cell'));
    expect(cells.map((c) => c.textContent)).toEqual([' a ', ' b ', ' 1 ', ' 2 ']);
    expect(cells.every((c) => c.classList.contains('cm-table-cell'))).toBe(true);
  });

  it('5. alignment applies identically to an empty cell as to a populated one in the same column', () => {
    const text = '| a | b |\n| :--- | ---: |\n| 1 | |\n\nOther';
    const view = mountView(text, text.indexOf('Other'));

    const rows = Array.from(view.dom.querySelectorAll('.cm-table-row'));
    const dataRow = rows[2];
    const cells = dataRow?.querySelectorAll('.cm-table-cell') ?? [];
    expect(cells).toHaveLength(2);
    expect(cells[0]?.classList.contains('cm-table-align-left')).toBe(true);
    expect(cells[1]?.classList.contains('cm-table-align-right')).toBe(true); // empty cell, same alignment as its column's header
  });
});
