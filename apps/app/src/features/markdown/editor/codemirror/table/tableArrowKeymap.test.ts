// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { defaultKeymap } from '@codemirror/commands';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { tableArrowKeymap } from './tableArrowKeymap';
import { tableDecoration } from './tableDecoration';

/** Includes `defaultKeymap` so a "defers to native" assertion actually exercises real cursor movement, not just the absence of a dispatch. */
function mountView(doc: string, anchor: number): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    selection: { anchor },
    extensions: [markdownLanguageExtension(), tableArrowKeymap(), keymap.of(defaultKeymap)],
  });
  return new EditorView({ state, parent });
}

/**
 * Same as `mountView`, but also mounts the real rendering layer
 * (`tableDecoration()` — hidden pipes, `cm-table-cell` marks). The plain
 * `mountView` above never exercises the actual hidden-decoration DOM at
 * all, which is exactly why the empty-cell entry-position bug (Right
 * landing on the ambiguous seam between a cell's own mark and the next
 * `TableDelimiter`'s hidden `Decoration.replace`) went undetected by the
 * original Step 2 tests: they were written before Step 6 wired rendering
 * in, and never re-verified against it afterward.
 */
function mountRenderedView(doc: string, anchor: number): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = EditorState.create({
    doc,
    selection: { anchor },
    extensions: [markdownLanguageExtension(), tableDecoration(), tableArrowKeymap(), keymap.of(defaultKeymap)],
  });
  return new EditorView({ state, parent });
}

function dispatchKey(view: EditorView, key: string): void {
  view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

/** Whether `pos` resolves, in the real decorated DOM, to somewhere inside a `.cm-table-cell` mark — the empty-cell bug's own signature was landing *outside* any cell mark, at the row's line `<div>` directly, immediately adjacent to a hidden `TableDelimiter`'s `Decoration.replace`/`cm-widgetBuffer` pair instead. */
function resolvesInsideCellMark(view: EditorView, pos: number): boolean {
  const { node } = view.domAtPos(pos);
  const el = node.nodeType === 3 ? node.parentElement : (node as Element);
  return el?.closest('.cm-table-cell') != null;
}

const TABLE = '| Name | Role |\n| - | - |\n| Vik | UX |';

describe('tableArrowKeymap — same-row, populated ↔ populated', () => {
  it('Right at the end of a cell jumps to the start of the next cell\'s content in one press', () => {
    const doc = TABLE;
    const vikEnd = doc.lastIndexOf('Vik') + 3;
    const view = mountView(doc, vikEnd);
    dispatchKey(view, 'ArrowRight');
    expect(view.state.selection.main.head).toBe(doc.lastIndexOf('UX'));
  });

  it('Left at the start of a cell jumps to the end of the previous cell\'s content in one press', () => {
    const doc = TABLE;
    const uxStart = doc.lastIndexOf('UX');
    const view = mountView(doc, uxStart);
    dispatchKey(view, 'ArrowLeft');
    expect(view.state.selection.main.head).toBe(doc.lastIndexOf('Vik') + 3);
  });

  it('defers to native in the middle of cell content', () => {
    const doc = TABLE;
    const midVik = doc.lastIndexOf('Vik') + 1;
    const view = mountView(doc, midVik);
    dispatchKey(view, 'ArrowRight');
    expect(view.state.selection.main.head).toBe(midVik + 1);
  });

  it('has no effect outside a table', () => {
    const doc = 'plain paragraph';
    const view = mountView(doc, 5);
    dispatchKey(view, 'ArrowRight');
    expect(view.state.selection.main.head).toBe(6);
  });
});

describe('tableArrowKeymap — empty cells (#7)', () => {
  it('Right from an empty cell still moves to the next cell, not past it', () => {
    const doc = '| A | | C |\n| - | - | - |\n| 1 | | 3 |';
    const lastRow = '| 1 | | 3 |';
    const emptyCellPos = doc.lastIndexOf(lastRow) + lastRow.indexOf('| |') + 2; // inside the empty cell
    const view = mountView(doc, emptyCellPos);
    dispatchKey(view, 'ArrowRight');
    expect(view.state.selection.main.head).toBe(doc.lastIndexOf('3'));
  });

  it('Left into an empty cell stops there, not past it', () => {
    const doc = '| A | | C |\n| - | - | - |\n| 1 | | 3 |';
    const threePos = doc.lastIndexOf('3');
    const lastRow = '| 1 | | 3 |';
    // The empty cell's gap is the single space in "| |" — approaching from
    // the right (Left-arrow) lands just past its own leading "|", the
    // gap's other boundary point from the one Right-arrow lands on above.
    const emptyCellLeftBoundary = doc.lastIndexOf(lastRow) + lastRow.indexOf('| |') + 1;
    const view = mountView(doc, threePos);
    dispatchKey(view, 'ArrowLeft');
    expect(view.state.selection.main.head).toBe(emptyCellLeftBoundary);
  });

  it('Right out of the last populated cell of a row crosses, row-major, into a following row\'s leading empty cell', () => {
    const doc = '| A | B |\n| - | - |\n| 1 | 2 |\n| | 4 |';
    const twoEnd = doc.indexOf('2') + 1;
    const view = mountRenderedView(doc, twoEnd);
    dispatchKey(view, 'ArrowRight');
    const head = view.state.selection.main.head;
    const emptyCellPos = doc.lastIndexOf('| |') + 1;
    expect(head).toBe(emptyCellPos);
    expect(resolvesInsideCellMark(view, head)).toBe(true);
  });

  it('Left out of a row-major empty cell crosses back into the previous row\'s last cell content end, visibly inside that cell', () => {
    const doc = '| A | B |\n| - | - |\n| 1 | 2 |\n| | 4 |';
    const emptyCellPos = doc.lastIndexOf('| |') + 1;
    const view = mountRenderedView(doc, emptyCellPos);
    dispatchKey(view, 'ArrowLeft');
    const head = view.state.selection.main.head;
    expect(head).toBe(doc.indexOf('2') + 1);
    expect(resolvesInsideCellMark(view, head)).toBe(true);
  });
});

describe('tableArrowKeymap — against the real decorated DOM (mounted with tableDecoration)', () => {
  const DOC = '| Name | Description | Status |\n| --- | --- | --- |\n| Apple | | Done |';

  it('Right at the end of a populated cell into another populated cell still resolves inside that cell\'s mark (unaffected by the empty-cell fix below)', () => {
    const nameEnd = DOC.indexOf('Name') + 4;
    const view = mountRenderedView(DOC, nameEnd);
    dispatchKey(view, 'ArrowRight');
    const head = view.state.selection.main.head;
    expect(head).toBe(DOC.indexOf('Description'));
    expect(resolvesInsideCellMark(view, head)).toBe(true);
  });

  it('Right from the end of a populated cell into an empty cell lands inside the empty cell\'s own mark, not on the hidden border', () => {
    const appleEnd = DOC.lastIndexOf('Apple') + 5;
    const view = mountRenderedView(DOC, appleEnd);
    dispatchKey(view, 'ArrowRight');
    const head = view.state.selection.main.head;
    // The empty cell's gap is the single space in "| Apple | | Done |" —
    // its only valid position is the gap's own left edge (confirmed via
    // `domAtPos`: the right edge resolves to the row's line `<div>`
    // directly, not inside any `.cm-table-cell` mark).
    const emptyCellPos = DOC.indexOf('| |', appleEnd) + 1;
    expect(head).toBe(emptyCellPos);
    expect(resolvesInsideCellMark(view, head)).toBe(true);
  });

  it('Left from the beginning of a populated cell into an empty cell lands inside the empty cell\'s own mark (already correct, kept as a lock-in regression)', () => {
    const doneStart = DOC.lastIndexOf('Done');
    const view = mountRenderedView(DOC, doneStart);
    dispatchKey(view, 'ArrowLeft');
    const head = view.state.selection.main.head;
    const emptyCellPos = DOC.indexOf('| |', DOC.lastIndexOf('Apple')) + 1;
    expect(head).toBe(emptyCellPos);
    expect(resolvesInsideCellMark(view, head)).toBe(true);
  });

  it('Right into an empty cell never resolves to the same position as the following hidden delimiter\'s own range', () => {
    const appleEnd = DOC.lastIndexOf('Apple') + 5;
    const view = mountRenderedView(DOC, appleEnd);
    dispatchKey(view, 'ArrowRight');
    const head = view.state.selection.main.head;
    const rightDelimiterFrom = DOC.indexOf('| |', appleEnd) + 2; // the empty cell's own far/ambiguous edge
    expect(head).not.toBe(rightDelimiterFrom);
  });
});

describe('tableArrowKeymap — row-major traversal across the whole table (#1–#6, #11, #12)', () => {
  const DOC = '| Name | Description | Status |\n| --- | --- | --- |\n| Apple | A fruit | Done |\n| Banana | Another fruit | Todo |';

  // Every logical cell of the table, in row-major order, as
  // [start-of-content, end-of-content] document positions. Built once from
  // the raw doc's own indices so every test below is a direct, independent
  // check against the source text rather than against this module's own
  // navigation logic.
  const CELLS: { name: string; start: number; end: number }[] = [
    { name: 'Name (header)', start: DOC.indexOf('Name'), end: DOC.indexOf('Name') + 4 },
    { name: 'Description (header)', start: DOC.indexOf('Description'), end: DOC.indexOf('Description') + 11 },
    { name: 'Status (header)', start: DOC.indexOf('Status'), end: DOC.indexOf('Status') + 6 },
    { name: 'Apple', start: DOC.indexOf('Apple'), end: DOC.indexOf('Apple') + 5 },
    { name: 'A fruit', start: DOC.indexOf('A fruit'), end: DOC.indexOf('A fruit') + 7 },
    { name: 'Done', start: DOC.indexOf('Done'), end: DOC.indexOf('Done') + 4 },
    { name: 'Banana', start: DOC.indexOf('Banana'), end: DOC.indexOf('Banana') + 6 },
    { name: 'Another fruit', start: DOC.indexOf('Another fruit'), end: DOC.indexOf('Another fruit') + 13 },
    { name: 'Todo', start: DOC.indexOf('Todo'), end: DOC.indexOf('Todo') + 4 },
  ];

  it('#1 Right: end of Name (header) → beginning of Description (header), same row', () => {
    const view = mountRenderedView(DOC, CELLS[0]!.end);
    dispatchKey(view, 'ArrowRight');
    expect(view.state.selection.main.head).toBe(CELLS[1]!.start);
  });

  /**
   * The exact reported caret-anchoring regression: before the
   * `tableDecoration.ts` fix (widening each populated cell's own mark to
   * cover its full delimiter-bounded gap, padding included), this
   * document position was correct but its DOM anchor fell into a
   * browser-generated anonymous `table-cell` box between `Name`'s and
   * `Description`'s real ones — the caret rendered outside any visible
   * cell. Asserts both halves: the document position, and that it now
   * resolves inside `Name`'s own `.cm-table-cell` mark.
   */
  it('#2 Left: beginning of Description (header) → end of Name (header), same row, visibly inside the Name cell', () => {
    const view = mountRenderedView(DOC, CELLS[1]!.start);
    dispatchKey(view, 'ArrowLeft');
    const head = view.state.selection.main.head;
    expect(head).toBe(CELLS[0]!.end);
    expect(resolvesInsideCellMark(view, head)).toBe(true);
  });

  it('#3 Right: last cell of a row (Status, header) → first cell of the next row (Apple)', () => {
    const view = mountRenderedView(DOC, CELLS[2]!.end);
    dispatchKey(view, 'ArrowRight');
    const head = view.state.selection.main.head;
    expect(head).toBe(CELLS[3]!.start);
    expect(resolvesInsideCellMark(view, head)).toBe(true);
  });

  it('#4 Left: first cell of a row (Apple) → last cell of the previous row (Status, header), visibly inside that cell', () => {
    const view = mountRenderedView(DOC, CELLS[3]!.start);
    dispatchKey(view, 'ArrowLeft');
    const head = view.state.selection.main.head;
    expect(head).toBe(CELLS[2]!.end);
    expect(resolvesInsideCellMark(view, head)).toBe(true);
  });

  /**
   * #5/#6 deliberately test each boundary crossing independently (a fresh
   * view mounted at the source cell's own end/start) rather than one
   * continuous session of repeated presses: from the *start* of a
   * multi-character cell, `ArrowRight` correctly defers to native and
   * moves one real character forward (ordinary interior editing, untouched
   * by this file) — it does not jump straight to that same cell's own end.
   * Simulating a full continuous walk would conflate that ordinary native
   * interior movement with the boundary-crossing logic this suite exists
   * to verify, for no added coverage: every boundary in the table is
   * already exercised directly here, exactly once each.
   */
  it('#5 Right through every logical cell boundary of the entire table, in row-major order', () => {
    for (let i = 0; i < CELLS.length - 1; i++) {
      const view = mountRenderedView(DOC, CELLS[i]!.end);
      dispatchKey(view, 'ArrowRight');
      expect(view.state.selection.main.head).toBe(CELLS[i + 1]!.start);
    }
  });

  it('#6 Left through every logical cell boundary of the entire table, in row-major order', () => {
    for (let i = CELLS.length - 1; i > 0; i--) {
      const view = mountRenderedView(DOC, CELLS[i]!.start);
      dispatchKey(view, 'ArrowLeft');
      expect(view.state.selection.main.head).toBe(CELLS[i - 1]!.end);
    }
  });

  it('#8 repeated Left from the first logical cell of the entire table stays there — never enters hidden syntax, never wraps around', () => {
    const view = mountRenderedView(DOC, CELLS[0]!.start);
    for (let i = 0; i < 6; i++) {
      dispatchKey(view, 'ArrowLeft');
      expect(view.state.selection.main.head).toBe(CELLS[0]!.start);
    }
  });

  it('#9 repeated Right from the last logical cell of the entire table stays there — never enters hidden syntax, never wraps around', () => {
    const view = mountRenderedView(DOC, CELLS[CELLS.length - 1]!.end);
    for (let i = 0; i < 6; i++) {
      dispatchKey(view, 'ArrowRight');
      expect(view.state.selection.main.head).toBe(CELLS[CELLS.length - 1]!.end);
    }
  });

  it('#10 crossing every boundary in either direction always lands exactly on a real content position — never a delimiter, a padding space, or a position inside the fully-hidden alignment row', () => {
    const contentPositions = new Set<number>();
    for (const cell of CELLS) {
      contentPositions.add(cell.start);
      contentPositions.add(cell.end);
    }
    for (let i = 0; i < CELLS.length - 1; i++) {
      const rightView = mountRenderedView(DOC, CELLS[i]!.end);
      dispatchKey(rightView, 'ArrowRight');
      expect(contentPositions.has(rightView.state.selection.main.head)).toBe(true);

      const leftView = mountRenderedView(DOC, CELLS[i + 1]!.start);
      dispatchKey(leftView, 'ArrowLeft');
      expect(contentPositions.has(leftView.state.selection.main.head)).toBe(true);
    }
  });

  it('#11 the destination for Right is exactly start-of-content, never anywhere inside the leading padding', () => {
    const view = mountRenderedView(DOC, CELLS[3]!.end); // end of "Apple"
    dispatchKey(view, 'ArrowRight');
    // "A fruit" is preceded by exactly one padding space in the raw
    // Markdown (`| Apple | A fruit |`) — landing anywhere before its own
    // 'A' would mean stopping inside that padding instead of at content.
    expect(view.state.selection.main.head).toBe(CELLS[4]!.start);
  });

  it('#12 the destination for Left is exactly end-of-content, never anywhere inside the trailing padding', () => {
    const view = mountRenderedView(DOC, CELLS[4]!.start); // start of "A fruit"
    dispatchKey(view, 'ArrowLeft');
    // "Apple" is followed by exactly one padding space in the raw Markdown
    // — landing anywhere after its own 'e' would mean stopping inside that
    // padding instead of at content.
    expect(view.state.selection.main.head).toBe(CELLS[3]!.end);
  });
});

describe('tableArrowKeymap — logical-cell edge resolution (row.from/row.to and the alignment row)', () => {
  const DOC = '| Name | Description | Status |\n| --- | --- | --- |\n| Apple | A fruit | Done |\n| Banana | Another fruit | Todo |';

  /**
   * `row.from` — the position immediately before a row's own leading `|`
   * (reachable via `Home`, or a click at the row's leftmost pixel) — is
   * visually indistinguishable from "the beginning of the first cell" but
   * is a distinct raw document position, one that `findCellIndexAt` alone
   * can't resolve (it falls just short of the first column's own
   * `leftDelimiterTo`). Traced empirically before this fix: repeated
   * `ArrowLeft` presses from here walked character-by-character *backward
   * through the alignment row's own hidden text* into the header row
   * above.
   */
  it('Left from row.from (before a data row\'s own leading pipe) crosses row-major into the previous row\'s last cell in one press, visibly inside that cell — never walks through the alignment row a character at a time', () => {
    const appleRowFrom = DOC.indexOf('| Apple');
    const view = mountRenderedView(DOC, appleRowFrom);
    dispatchKey(view, 'ArrowLeft');
    const head = view.state.selection.main.head;
    expect(head).toBe(DOC.indexOf('Status') + 6); // end of Status, the previous (header) row's last cell
    expect(resolvesInsideCellMark(view, head)).toBe(true);
  });

  it('Right from row.from (before the row\'s own leading pipe) jumps straight to the first cell\'s content, never landing one raw step into the hidden leading delimiter', () => {
    const appleRowFrom = DOC.indexOf('| Apple');
    const view = mountRenderedView(DOC, appleRowFrom);
    dispatchKey(view, 'ArrowRight');
    const head = view.state.selection.main.head;
    expect(head).toBe(DOC.indexOf('Apple'));
    expect(resolvesInsideCellMark(view, head)).toBe(true);
  });

  /**
   * Symmetric case: `row.to` (immediately after a row's own trailing `|`,
   * before the line's own newline — reachable via `End`, or a click at the
   * row's rightmost pixel). Traced empirically before this fix: repeated
   * `ArrowRight` from here walked forward through the row's own trailing
   * hidden delimiter, the newline, and into the *next* row's hidden
   * leading delimiter and real cell text, instead of resolving to a clean
   * logical-cell jump.
   */
  it('Right from row.to (after a row\'s own trailing pipe) crosses row-major into the next row\'s first cell, never landing one raw step into the hidden trailing delimiter', () => {
    const doneRowTo = DOC.indexOf('\n| Banana');
    const view = mountRenderedView(DOC, doneRowTo);
    dispatchKey(view, 'ArrowRight');
    const head = view.state.selection.main.head;
    expect(head).toBe(DOC.indexOf('Banana'));
    expect(resolvesInsideCellMark(view, head)).toBe(true);
  });

  it('Left from row.to (after the row\'s own trailing pipe) jumps straight to the last cell\'s content end, visibly inside that cell, never landing one raw step into the hidden trailing delimiter', () => {
    const doneRowTo = DOC.indexOf('\n| Banana');
    const view = mountRenderedView(DOC, doneRowTo);
    dispatchKey(view, 'ArrowLeft');
    const head = view.state.selection.main.head;
    expect(head).toBe(DOC.indexOf('Done') + 4);
    expect(resolvesInsideCellMark(view, head)).toBe(true);
  });

  /**
   * The alignment row (`| --- | --- | --- |`) has no columns at all, per
   * `getRowCellBounds`, so it can never resolve to a logical cell. That
   * resolution failure must mean "consume, stay put," matching every other
   * position with no logical cell to move to.
   */
  it('repeated Left/Right from inside the alignment row are consumed and stay put — never walk through its own hidden interior', () => {
    const alignRowPos = DOC.indexOf('| --- |') + 3;
    const leftView = mountRenderedView(DOC, alignRowPos);
    for (let i = 0; i < 4; i++) {
      dispatchKey(leftView, 'ArrowLeft');
      expect(leftView.state.selection.main.head).toBe(alignRowPos);
    }
    const rightView = mountRenderedView(DOC, alignRowPos);
    for (let i = 0; i < 4; i++) {
      dispatchKey(rightView, 'ArrowRight');
      expect(rightView.state.selection.main.head).toBe(alignRowPos);
    }
  });
});
