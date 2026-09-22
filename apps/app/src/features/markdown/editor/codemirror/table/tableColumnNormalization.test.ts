// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { markdownLanguageExtension } from '../markdownLanguage';
import { findAllTables } from './tableGeometry';
import { computeTableNormalizationChange, normalizeAllTablesInMarkdown, normalizeTableAt } from './tableColumnNormalization';

const mountedViews: EditorView[] = [];

afterEach(() => {
  for (const view of mountedViews.splice(0)) {
    view.destroy();
  }
});

function mountRootView(doc: string): EditorView {
  const view = new EditorView({
    state: EditorState.create({
      doc,
      selection: EditorSelection.cursor(0),
      extensions: [markdownLanguageExtension()],
    }),
    parent: document.body.appendChild(document.createElement('div')),
  });
  mountedViews.push(view);
  return view;
}

function normalize(doc: string): string {
  const view = mountRootView(doc);
  const table = findAllTables(view.state)[0]!;
  const change = computeTableNormalizationChange(view.state, table);
  if (!change) {
    return doc;
  }
  view.dispatch({ changes: [change] });
  return view.state.doc.toString();
}

describe('computeTableNormalizationChange', () => {
  it('aligns a simple 3-column table to its widest cell per column', () => {
    const doc = '| Name | Role | City |\n| ---- | ---- | ---- |\n| Vik | Designer | Delhi |\n| Alex | Engineer | Come on man this is really long table cell |';
    expect(normalize(doc)).toBe(
      '| Name | Role     | City                                       |\n' +
        '| ---- | -------- | ------------------------------------------ |\n' +
        '| Vik  | Designer | Delhi                                      |\n' +
        '| Alex | Engineer | Come on man this is really long table cell |'
    );
  });

  it('sizes each column independently off its own longest content, wherever that content lives', () => {
    const doc = '| A | B | C |\n| --- | --- | --- |\n| A value is longest here | b | c |\n| a | B value is medium | c |\n| a | b | tiny |';
    const result = normalize(doc);
    const lines = result.split('\n');
    // Column widths derive independently: column A's own longest cell sets column A's own width, not column B's or C's.
    expect(lines[0]).toBe('| A                       | B                 | C    |');
    expect(lines[2]).toBe('| A value is longest here | b                 | c    |');
    expect(lines[3]).toBe('| a                       | B value is medium | c    |');
    expect(lines[4]).toBe('| a                       | b                 | tiny |');
  });

  it('preserves left/center/right alignment markers while realigning widths', () => {
    const doc = '| Name | Role | City |\n| :--- | :--: | ---: |\n| Vik | Designer | Delhi |\n| Alex | Engineer | Come on man this is really long table cell |';
    const result = normalize(doc);
    const delimiter = result.split('\n')[1]!;
    expect(delimiter).toBe('| :--- | :------: | -----------------------------------------: |');
  });

  it('preserves escaped pipes as literal content, never misreading them as column boundaries', () => {
    const doc = '| A | B |\n| --- | --- |\n| a \\| b | c |';
    const result = normalize(doc);
    expect(result.split('\n')).toHaveLength(3);
    expect(result).toContain('a \\| b');
    expect(normalize(result)).toBe(result);
  });

  it('pads empty cells out to their column width without dropping them', () => {
    const doc = '| Name | Note |\n| --- | --- |\n| Vik |  |\n|  | Reminder |';
    const result = normalize(doc);
    expect(result).toBe('| Name | Note     |\n| ---- | -------- |\n| Vik  |          |\n|      | Reminder |');
  });

  it('normalizes a header-only table (no body rows) using the header/delimiter minimum width', () => {
    const doc = '| Name | Role |\n| --- | --- |';
    expect(normalize(doc)).toBe('| Name | Role |\n| ---- | ---- |');
  });

  it('completes a ragged table into a full rectangle while normalizing', () => {
    const doc = '| Name | Role | City |\n| --- | --- | --- |\n| Vik | Designer |\n| Alex |';
    const result = normalize(doc);
    for (const line of result.split('\n')) {
      expect(line.split('|')).toHaveLength(5); // leading + 3 cells + trailing = 4 pipes -> 5 segments
    }
    expect(result).toContain('| Vik  | Designer |      |');
    expect(result).toContain('| Alex |          |      |');
  });

  it('preserves inline Markdown formatting inside cells verbatim', () => {
    const doc = '| Name | Note |\n| --- | --- |\n| Vik | **bold** and [[WikiLink]] |';
    const result = normalize(doc);
    expect(result).toContain('**bold** and [[WikiLink]]');
  });

  it('never narrows a delimiter cell below the GFM minimum for its declared alignment', () => {
    const doc = '| A | B | C |\n| --- | :--- | :--: |\n| 1 | 2 | 3 |';
    const delimiter = normalize(doc).split('\n')[1]!;
    const cells = delimiter.slice(1, -1).split('|').map((c) => c.trim());
    expect(cells[0]).toBe('-'); // plain, min gap width 3 (1 space + 1 dash + 1 space)
    expect(cells[1]).toBe(':-'); // one colon, min gap width 4
    expect(cells[2]).toBe(':-:'); // two colons, min gap width 5
  });

  it('is idempotent: normalizing an already-normalized table is a no-op', () => {
    const doc = '| Name | Role | City |\n| ---- | ---- | ---- |\n| Vik | Designer | Delhi |\n| Alex | Engineer | Come on man this is really long table cell |';
    const once = normalize(doc);
    const twice = normalize(once);
    expect(twice).toBe(once);

    const view = mountRootView(once);
    const table = findAllTables(view.state)[0]!;
    expect(computeTableNormalizationChange(view.state, table)).toBeNull();
  });

  it('returns null for a malformed table with no delimiter row', () => {
    const view = mountRootView('| A | B |\nnot a table');
    const table = findAllTables(view.state)[0];
    if (table) {
      expect(computeTableNormalizationChange(view.state, table)).toBeNull();
    }
  });
});

describe('normalizeTableAt', () => {
  it('dispatches the normalization change for the table at the given position and returns true', () => {
    const doc = '| Name | Role |\n| --- | --- |\n| Vik | Designer |\n| Alex | Engineer |';
    const view = mountRootView(doc);
    const applied = normalizeTableAt(view, 2);
    expect(applied).toBe(true);
    expect(view.state.doc.toString()).toContain('| Name | Role     |');
  });

  it('returns false when the position is not inside a table', () => {
    const view = mountRootView('just some text');
    expect(normalizeTableAt(view, 2)).toBe(false);
  });

  it('returns false (no-op) when the table at the position is already normalized', () => {
    const doc = '| Name | Role     |\n| ---- | -------- |\n| Vik  | Designer |';
    const view = mountRootView(doc);
    expect(normalizeTableAt(view, 2)).toBe(false);
  });
});

describe('normalizeAllTablesInMarkdown — the headless, save-path entry point', () => {
  it('a long cell determines its own column width', () => {
    const doc = '| Name | Role | City |\n| --- | --- | --- |\n| Vik | UI | Come on man this is really long table cells |\n| Sam | UX | Pune |';
    const result = normalizeAllTablesInMarkdown(doc);
    const cityWidth = result.split('\n')[2]!.split('|')[3]!.length;
    expect(result.split('\n')[0]!.split('|')[3]!.length).toBe(cityWidth);
    expect(result.split('\n')[3]!.split('|')[3]!.length).toBe(cityWidth);
    expect(result).toContain('Come on man this is really long table cells');
  });

  it('pads short cells out to the column width', () => {
    const doc = '| Name | Role | City |\n| --- | --- | --- |\n| Vik | UI | Come on man this is really long table cells |\n| Sam | UX | Pune |';
    const result = normalizeAllTablesInMarkdown(doc);
    expect(result).toBe(
      '| Name | Role | City                                        |\n' +
        '| ---- | ---- | ------------------------------------------- |\n' +
        '| Vik  | UI   | Come on man this is really long table cells |\n' +
        '| Sam  | UX   | Pune                                        |'
    );
  });

  it('keeps empty cells padded to the column width, not collapsed', () => {
    const doc =
      '| Name | Role | City |\n| --- | --- | --- |\n| Vik | UI | Come on man this is really long table cells |\n| Sam | UX | Pune |\n|  |  |  |';
    const result = normalizeAllTablesInMarkdown(doc);
    const lastLine = result.split('\n').at(-1)!;
    expect(lastLine).toBe('|      |      |                                             |');
  });

  it('completes ragged Markdown into a rectangular, normalized table', () => {
    const doc = '| Name | Role | City |\n| --- | --- | --- |\n|  |  | Bangalore |';
    const result = normalizeAllTablesInMarkdown(doc);
    expect(result).toBe('| Name | Role | City      |\n| ---- | ---- | --------- |\n|      |      | Bangalore |');
  });

  it('preserves alignment markers while realigning widths', () => {
    const doc = '| Name | Role | City |\n| :--- | :--: | ---: |\n| Vik | Designer | Delhi |\n| Alex | Engineer | Come on man this is really long table cells |';
    const result = normalizeAllTablesInMarkdown(doc);
    expect(result.split('\n')[1]).toBe('| :--- | :------: | ------------------------------------------: |');
  });

  it('preserves escaped pipes as literal cell content', () => {
    const doc = '| A | B |\n| --- | --- |\n| a \\| b | c |';
    const result = normalizeAllTablesInMarkdown(doc);
    expect(result).toContain('a \\| b');
  });

  it('leaves non-table Markdown completely unchanged (same string reference)', () => {
    const doc = '# Heading\n\nSome *paragraph* text with a [[WikiLink]] and no tables at all.\n\n- a list\n- item two';
    expect(normalizeAllTablesInMarkdown(doc)).toBe(doc);
  });

  it('is a no-op (same string reference, no diff churn) when every table is already normalized', () => {
    const doc = '| Name | Role     |\n| ---- | -------- |\n| Vik  | Designer |\n\nSome trailing prose.';
    const result = normalizeAllTablesInMarkdown(doc);
    expect(result).toBe(doc);
  });

  it('normalizes multiple tables in the same document independently', () => {
    const doc = '| A | B |\n| --- | --- |\n| x | Long content here |\n\nSome text between.\n\n| C | D |\n| --- | --- |\n| y | z |';
    const result = normalizeAllTablesInMarkdown(doc);
    expect(result).toContain('| A | B                 |');
    expect(result).toContain('| C | D |');
  });
});
