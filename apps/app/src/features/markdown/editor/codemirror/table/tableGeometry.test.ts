import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';

import { markdownLanguageExtension } from '../markdownLanguage';
import { findAllTables } from './tableGeometry';

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
