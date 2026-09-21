import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';

import { markdownLanguageExtension } from '../markdownLanguage';
import {
  buildWidthMatchedRowText,
  findAllTables,
  findEnclosingTable,
  getNavigableRows,
  getRectangularRowCellBounds,
  getRowCellBounds,
  padCellContent,
  resolveCellAt,
  widthMatchedRowCellOffset,
} from './tableGeometry';

function makeState(doc: string): EditorState {
  return EditorState.create({ doc, extensions: [markdownLanguageExtension()] });
}

/** The `Table` node's own header + navigable rows, for the tests below — a small local convenience, not a shared helper (this file's own established style, per `findAllTables`'s own describe block above). */
function tableRows(doc: string) {
  const state = makeState(doc);
  const table = findEnclosingTable(state, 0)!;
  return { state, table, rows: getNavigableRows(table) };
}

describe('findAllTables', () => {
  it('finds every table in a multi-table document, in document order', () => {
    const text = '| a |\n| - |\n| 1 |\n\nParagraph\n\n| x | y |\n| - | - |\n| 9 | 8 |';
    const state = makeState(text);

    const tables = findAllTables(state);

    expect(tables).toHaveLength(2);
    expect(tables[0]?.from).toBe(0);
    expect(text.slice(tables[0]!.from, tables[0]!.to)).toBe('| a |\n| - |\n| 1 |');
    expect(text.slice(tables[1]!.from, tables[1]!.to)).toBe('| x | y |\n| - | - |\n| 9 | 8 |');
  });

  it('returns an empty array for a document with no tables', () => {
    const state = makeState('Just a paragraph.\n\nAnother one.');

    expect(findAllTables(state)).toEqual([]);
  });

  it('a table adjacent to other block content is still found correctly', () => {
    const text = '# Heading\n\n| a |\n| - |\n| 1 |\n\n- list item';
    const state = makeState(text);

    const tables = findAllTables(state);

    expect(tables).toHaveLength(1);
    expect(text.slice(tables[0]!.from, tables[0]!.to)).toBe('| a |\n| - |\n| 1 |');
  });
});

describe('padCellContent', () => {
  it('pads empty content out to a full, structurally-padded minimum-width gap', () => {
    expect(padCellContent('', 6)).toBe('      ');
  });

  it('preserves the existing gap width when content fits within it', () => {
    expect(padCellContent('9', 5)).toBe(' 9   ');
    expect(padCellContent('Vi', 6)).toBe(' Vi   ');
  });

  it('grows the gap (never truncates content) when content overflows the minimum width', () => {
    // minGapWidth=3 has no room for "hello" (5) plus a leading+trailing
    // margin (2) — the result still carries at least one leading and one
    // trailing space, growing past the minimum rather than clipping.
    expect(padCellContent('hello', 3)).toBe(' hello ');
  });

  it('always keeps at least a single leading and trailing space, even at the degenerate 1-wide minimum', () => {
    expect(padCellContent('', 1)).toBe('  ');
  });
});

describe('buildWidthMatchedRowText / widthMatchedRowCellOffset', () => {
  it('builds a row whose cells are each width-matched via padCellContent', () => {
    expect(buildWidthMatchedRowText([6, 5])).toBe('|      |     |');
  });

  it("computes each column's own content-start offset, accounting for every earlier column's width", () => {
    const widths = [6, 5];
    expect(widthMatchedRowCellOffset(widths, 0)).toBe(2);
    expect(widthMatchedRowCellOffset(widths, 1)).toBe(2 + widths[0]! + 1);
  });
});

describe('getRectangularRowCellBounds — rectangular-table invariant (docs/table-range-selection-clipboard-ux-contract.md)', () => {
  it('a row missing its final (trailing) cell is padded with one synthetic bounds entry', () => {
    const { rows } = tableRows('| Name | Role | City |\n| --- | --- | --- |\n| Vik | UI |');
    const bounds = getRectangularRowCellBounds(3, rows[1]!);

    expect(bounds).toHaveLength(3);
    expect(bounds[0]!.synthetic).toBeUndefined();
    expect(bounds[1]!.synthetic).toBeUndefined();
    expect(bounds[2]!.synthetic).toBe(true);
    expect(bounds[2]!.leftDelimiterTo).toBe(rows[1]!.to);
    expect(bounds[2]!.rightDelimiterFrom).toBe(rows[1]!.to);
  });

  it('multiple missing trailing cells are each padded with their own synthetic entry', () => {
    const { rows } = tableRows('| A | B | C | D |\n| --- | --- | --- | --- |\n| 1 |');
    const bounds = getRectangularRowCellBounds(4, rows[1]!);

    expect(bounds).toHaveLength(4);
    expect(bounds.map((b) => b.synthetic ?? false)).toEqual([false, true, true, true]);
  });

  it('a "missing middle cell" cannot actually occur in GFM — a shorter row is always ragged from the trailing end, never a hole with real content after it', () => {
    // The syntax offers no way to write "column 2 is absent but column 3
    // has real content" — pipes are strictly sequential left-to-right, so
    // any row shorter than the header is short from the *end*, never the
    // middle. An *explicitly empty* middle cell (`| Vik | | Delhi |`) is a
    // completely different, already-fully-supported shape: a real,
    // 3-column row with genuinely empty (not missing) content in column 2
    // — never ragged, never padded.
    const { rows } = tableRows('| Name | Role | City |\n| --- | --- | --- |\n| Vik |  | Delhi |');
    const raw = getRowCellBounds(rows[1]!);
    const rectangular = getRectangularRowCellBounds(3, rows[1]!);

    expect(raw).toHaveLength(3); // already rectangular — nothing to pad
    expect(rectangular).toEqual(raw);
    expect(rectangular.some((b) => b.synthetic)).toBe(false);
  });

  it('an already-rectangular row is returned unchanged (no synthetic entries, same length as getRowCellBounds)', () => {
    const { rows } = tableRows('| A | B |\n| --- | --- |\n| 1 | 2 |');
    expect(getRectangularRowCellBounds(2, rows[1]!)).toEqual(getRowCellBounds(rows[1]!));
  });

  it('a row ragged by different amounts than a sibling row is padded independently, per row', () => {
    const { rows } = tableRows('| A | B | C |\n| --- | --- | --- |\n| 1 |\n| 2 | 3 |');
    expect(getRectangularRowCellBounds(3, rows[1]!).map((b) => b.synthetic ?? false)).toEqual([false, true, true]);
    expect(getRectangularRowCellBounds(3, rows[2]!).map((b) => b.synthetic ?? false)).toEqual([false, false, true]);
  });

  it('the header row (which defines the column count) is never itself padded', () => {
    const { rows } = tableRows('| A | B | C |\n| --- | --- | --- |\n| 1 |');
    const headerBounds = getRectangularRowCellBounds(3, rows[0]!);
    expect(headerBounds).toHaveLength(3);
    expect(headerBounds.every((b) => !b.synthetic)).toBe(true);
  });
});

describe('resolveCellAt — rectangular, not clamped (rectangular-table invariant)', () => {
  it('a missing column returns a synthetic bounds at the requested index, not the row\'s own last real column', () => {
    const { state, table } = tableRows('| A | B | C |\n| --- | --- | --- |\n| 1 |');
    const result = resolveCellAt(table, 1, 2);
    expect(result).not.toBeNull();
    expect(result!.bounds.synthetic).toBe(true);
    void state;
  });

  it('a real column at that index is still returned exactly as getRowCellBounds already would', () => {
    const { table } = tableRows('| A | B |\n| --- | --- |\n| 1 | 2 |');
    const result = resolveCellAt(table, 1, 1);
    expect(result!.bounds.synthetic).toBeUndefined();
  });
});
