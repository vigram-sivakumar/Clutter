import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';

import { markdownLanguageExtension } from '../markdownLanguage';
import { buildWidthMatchedRowText, findAllTables, padCellContent, widthMatchedRowCellOffset } from './tableGeometry';

function makeState(doc: string): EditorState {
  return EditorState.create({ doc, extensions: [markdownLanguageExtension()] });
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
