// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { createInlineLivePreviewParticipants } from '../highlight/inlineLivePreviewParticipants';
import { inlineLivePreviewRegion } from '../highlight/inlineLivePreviewRegion';
import { markdownLanguageExtension } from '../markdownLanguage';
import { wikiLinkLivePreview } from '../wikilink/wikiLinkLivePreview';
import { tableDecoration } from './tableDecoration';

const noResolvers = { resolveTag: () => undefined, resolveDate: () => undefined };

/**
 * What a user actually sees — see inlineLivePreviewRegion.test.ts's own
 * `visibleText` doc comment for the full rationale. Needed here because a
 * migrated construct (bold) can appear inside a table cell, and its
 * concealed marker text (`cm-marker--concealed`) is now real DOM text,
 * not removed.
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

describe('tableDecoration — per-row engagement', () => {
  it('cursor in one data row reveals only that row\'s raw "|" — other rows stay rendered', () => {
    const text = '| a | b |\n| - | - |\n| 1 | 2 |\n| 3 | 4 |';
    const thirdRowStart = text.indexOf('| 3');
    const view = mountView(text, thirdRowStart + 2); // inside "3"

    // The engaged row's own pipes are visible.
    expect(view.dom.textContent).toContain('| 3 | 4 |');
    // Every other row is still grid-decorated (no pipes of its own visible).
    const rows = view.dom.querySelectorAll('.cm-table-row');
    expect(rows).toHaveLength(4); // header, alignment, row1, row2 — all still table-rows
  });

  it('engaging the header row reveals only its own pipes, not the data rows\'', () => {
    const text = '| a | b |\n| - | - |\n| 1 | 2 |';
    const view = mountView(text, 2); // inside "a", the header row

    expect(view.dom.textContent).toContain('| a | b |');
    expect(view.dom.textContent).not.toContain('| 1 | 2 |');
  });

  it('re-collapses once the selection leaves the row', () => {
    const text = '| a | b |\n| - | - |\n| 1 | 2 |\n\nOther';
    const dataRowStart = text.indexOf('| 1');
    const view = mountView(text, dataRowStart + 2); // inside "1"

    expect(view.dom.textContent).toContain('| 1 | 2 |');

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

  it('reveals its raw text when the cursor is on the alignment row itself', () => {
    const text = '| a | b |\n| :--- | ---: |\n| 1 | 2 |';
    const alignRowStart = text.indexOf(':---');
    const view = mountView(text, alignRowStart);

    expect(view.dom.textContent).toContain('| :--- | ---: |');
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

  it('engaging a row in the second table does not reveal any row in the first table', () => {
    const text = '| a |\n| - |\n| 1 |\n\n| x |\n| - |\n| 9 |';
    const secondTableDataRow = text.lastIndexOf('| 9');
    const view = mountView(text, secondTableDataRow + 2);

    expect(view.dom.textContent).toContain('| 9 |');
    expect(view.dom.textContent).not.toContain('| 1 |');
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
