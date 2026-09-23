import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';

import { markdownLanguageExtension } from '../markdownLanguage';
import { findAllTables } from './tableGeometry';
import { normalizeAllTablesInMarkdown } from './tableColumnNormalization';
import {
  DEFAULT_TABLE_COLUMN_WIDTH,
  MIN_TABLE_COLUMN_WIDTH,
  computeTableColumnWidthsCommitChange,
  findAllTableColumnWidths,
  materializeWidthsForResize,
  nextWidthsAfterColumnDeletion,
  nextWidthsAfterColumnDuplication,
  nextWidthsAfterColumnInsertion,
  nextWidthsAfterColumnMove,
  parseTableColumnWidthsAttribute,
  resolveExistingAttributeLineRange,
  resolveTableColumnWidths,
  serializeTableColumnWidthsAttribute,
} from './tableColumnWidthMetadata';

function stateFor(doc: string): EditorState {
  return EditorState.create({ doc, extensions: [markdownLanguageExtension()] });
}

const SIMPLE_TABLE = '| Name | Role | City |\n| ---- | ---- | ---- |\n| Vik  | UI   | Chennai |';

describe('parseTableColumnWidthsAttribute', () => {
  it('parses a valid attribute line', () => {
    expect(parseTableColumnWidthsAttribute('{table-col-widths="120,80,240"}')).toEqual([120, 80, 240]);
  });

  it('tolerates surrounding whitespace on the line and around each value', () => {
    expect(parseTableColumnWidthsAttribute('  {table-col-widths="120, 80 ,240"}  ')).toEqual([120, 80, 240]);
  });

  it('parses a single-width attribute', () => {
    expect(parseTableColumnWidthsAttribute('{table-col-widths="120"}')).toEqual([120]);
  });

  it.each([
    ['wrong key', '{col-widths="120,80,240"}'],
    ['unrelated attribute', '{.some-class}'],
    ['different attribute entirely', '{width=120}'],
    ['missing quotes', '{table-col-widths=120,80,240}'],
    ['trailing text after the attribute', '{table-col-widths="120,80,240"} extra'],
    ['leading text before the attribute', 'extra {table-col-widths="120,80,240"}'],
    ['empty value', '{table-col-widths=""}'],
    ['non-numeric value', '{table-col-widths="120,abc,240"}'],
    ['negative value', '{table-col-widths="120,-80,240"}'],
    ['zero value', '{table-col-widths="120,0,240"}'],
    ['decimal value', '{table-col-widths="120,80.5,240"}'],
    ['empty token between commas', '{table-col-widths="120,,240"}'],
    ['plain paragraph text', 'Just an ordinary sentence.'],
    ['empty string', ''],
  ])('returns null for %s', (_label, lineText) => {
    expect(parseTableColumnWidthsAttribute(lineText)).toBeNull();
  });
});

describe('serializeTableColumnWidthsAttribute', () => {
  it('round-trips through parseTableColumnWidthsAttribute', () => {
    const widths = [120, 80, 240];
    const serialized = serializeTableColumnWidthsAttribute(widths);
    expect(serialized).toBe('{table-col-widths="120,80,240"}');
    expect(parseTableColumnWidthsAttribute(serialized)).toEqual(widths);
  });

  it('serializes a single width with no trailing comma', () => {
    expect(serializeTableColumnWidthsAttribute([120])).toBe('{table-col-widths="120"}');
  });
});

describe('resolveTableColumnWidths', () => {
  it('resolves valid metadata immediately after a table', () => {
    const doc = `${SIMPLE_TABLE}\n{table-col-widths="120,80,240"}`;
    const state = stateFor(doc);
    const table = findAllTables(state)[0]!;
    const attribute = resolveTableColumnWidths(state, table);
    expect(attribute).not.toBeNull();
    expect(attribute!.widths).toEqual([120, 80, 240]);
  });

  it('returns null for a table with no metadata at all', () => {
    const state = stateFor(SIMPLE_TABLE);
    const table = findAllTables(state)[0]!;
    expect(resolveTableColumnWidths(state, table)).toBeNull();
  });

  it('returns null for a table that is the last content in the document', () => {
    const state = stateFor(SIMPLE_TABLE);
    const table = findAllTables(state)[0]!;
    expect(resolveTableColumnWidths(state, table)).toBeNull();
  });

  it('returns null for malformed metadata immediately after a table', () => {
    const doc = `${SIMPLE_TABLE}\n{table-col-widths="120,abc,240"}`;
    const state = stateFor(doc);
    const table = findAllTables(state)[0]!;
    expect(resolveTableColumnWidths(state, table)).toBeNull();
  });

  it('returns null for an unrelated {...} paragraph after a table', () => {
    const doc = `${SIMPLE_TABLE}\n{.some-other-attribute}`;
    const state = stateFor(doc);
    const table = findAllTables(state)[0]!;
    expect(resolveTableColumnWidths(state, table)).toBeNull();
  });

  it('returns null when a blank line separates the table from an attribute line', () => {
    const doc = `${SIMPLE_TABLE}\n\n{table-col-widths="120,80,240"}`;
    const state = stateFor(doc);
    const table = findAllTables(state)[0]!;
    expect(resolveTableColumnWidths(state, table)).toBeNull();
  });

  it('does not include the attribute line in the table\'s own source range', () => {
    const doc = `${SIMPLE_TABLE}\n{table-col-widths="120,80,240"}`;
    const state = stateFor(doc);
    const table = findAllTables(state)[0]!;
    const attribute = resolveTableColumnWidths(state, table)!;
    expect(attribute.from).toBeGreaterThanOrEqual(table.to);
    expect(state.sliceDoc(table.from, table.to)).toBe(SIMPLE_TABLE);
    expect(state.sliceDoc(table.from, table.to)).not.toContain('table-col-widths');
  });

  it('reports metadata without a preceding table as unassociated with anything (no table found at all)', () => {
    const doc = '{table-col-widths="120,80,240"}';
    const state = stateFor(doc);
    expect(findAllTables(state)).toHaveLength(0);
  });
});

describe('findAllTableColumnWidths', () => {
  it('associates independent metadata with each of multiple tables', () => {
    const doc =
      '# People\n\n' +
      `${SIMPLE_TABLE}\n{table-col-widths="120,80,240"}\n\n` +
      '# Projects\n\n' +
      '| Project | Status |\n| ---- | ---- |\n| Site | Active |\n{table-col-widths="200,100"}';
    const state = stateFor(doc);
    const results = findAllTableColumnWidths(state);
    expect(results).toHaveLength(2);
    expect(results[0]!.attribute?.widths).toEqual([120, 80, 240]);
    expect(results[1]!.attribute?.widths).toEqual([200, 100]);
  });

  it('leaves a table without metadata as null alongside a sibling table that does have it', () => {
    const doc =
      `${SIMPLE_TABLE}\n{table-col-widths="120,80,240"}\n\n` +
      '# Projects\n\n' +
      '| Project | Status |\n| ---- | ---- |\n| Site | Active |';
    const state = stateFor(doc);
    const results = findAllTableColumnWidths(state);
    expect(results).toHaveLength(2);
    expect(results[0]!.attribute?.widths).toEqual([120, 80, 240]);
    expect(results[1]!.attribute).toBeNull();
  });
});

describe('table detection is unaffected by a following attribute line', () => {
  it('parses the same Table node range with or without a trailing attribute line', () => {
    const withoutAttribute = stateFor(SIMPLE_TABLE);
    const withAttribute = stateFor(`${SIMPLE_TABLE}\n{table-col-widths="120,80,240"}`);
    const tableWithout = findAllTables(withoutAttribute)[0]!;
    const tableWith = findAllTables(withAttribute)[0]!;
    expect(tableWith.to - tableWith.from).toBe(tableWithout.to - tableWithout.from);
    expect(withAttribute.sliceDoc(tableWith.from, tableWith.to)).toBe(SIMPLE_TABLE);
  });

  it('still finds exactly one table when an attribute line follows it', () => {
    const state = stateFor(`${SIMPLE_TABLE}\n{table-col-widths="120,80,240"}`);
    expect(findAllTables(state)).toHaveLength(1);
  });
});

describe('normalization preserves table column-width metadata', () => {
  it('leaves the attribute line byte-identical after save-boundary normalization', () => {
    const doc = '| Name | Role | City |\n| ---- | ---- | ---- |\n| Vik | Designer | Chennai |\n{table-col-widths="120,80,240"}';
    const normalized = normalizeAllTablesInMarkdown(doc);
    expect(normalized).toContain('{table-col-widths="120,80,240"}');
    const attributeLine = normalized.split('\n').find((line) => line.startsWith('{table-col-widths'));
    expect(attributeLine).toBe('{table-col-widths="120,80,240"}');
  });

  it('preserves independent metadata for multiple tables through save-boundary normalization', () => {
    const doc =
      '| Name | Role | City |\n| ---- | ---- | ---- |\n| Vik | Designer | Chennai |\n{table-col-widths="120,80,240"}\n\n' +
      '| Project | Status |\n| ---- | ---- |\n| Site | Active |\n{table-col-widths="200,100"}';
    const normalized = normalizeAllTablesInMarkdown(doc);
    const state = stateFor(normalized);
    const results = findAllTableColumnWidths(state);
    expect(results).toHaveLength(2);
    expect(results[0]!.attribute?.widths).toEqual([120, 80, 240]);
    expect(results[1]!.attribute?.widths).toEqual([200, 100]);
  });

  it('does not fabricate metadata for a table normalized without any', () => {
    const doc = '| Name | Role | City |\n| ---- | ---- | ---- |\n| Vik | Designer | Chennai |';
    const normalized = normalizeAllTablesInMarkdown(doc);
    const state = stateFor(normalized);
    const results = findAllTableColumnWidths(state);
    expect(results).toHaveLength(1);
    expect(results[0]!.attribute).toBeNull();
  });
});

describe('resolveTableColumnWidths — column-count invariant', () => {
  it('accepts a width count that equals the table\'s own column count', () => {
    const doc = `${SIMPLE_TABLE}\n{table-col-widths="120,80,240"}`;
    const state = stateFor(doc);
    const table = findAllTables(state)[0]!;
    expect(resolveTableColumnWidths(state, table)?.widths).toEqual([120, 80, 240]);
  });

  it('falls back to automatic sizing (null) when there are too few widths for the column count', () => {
    const doc = `${SIMPLE_TABLE}\n{table-col-widths="120,80"}`;
    const state = stateFor(doc);
    const table = findAllTables(state)[0]!;
    expect(resolveTableColumnWidths(state, table)).toBeNull();
  });

  it('falls back to automatic sizing (null) when there are too many widths for the column count', () => {
    const doc = `${SIMPLE_TABLE}\n{table-col-widths="120,80,240,60"}`;
    const state = stateFor(doc);
    const table = findAllTables(state)[0]!;
    expect(resolveTableColumnWidths(state, table)).toBeNull();
  });

  it('never partially applies a mismatched array — the whole attribute is treated as absent', () => {
    const doc = `${SIMPLE_TABLE}\n{table-col-widths="120,80"}`;
    const state = stateFor(doc);
    const table = findAllTables(state)[0]!;
    const attribute = resolveTableColumnWidths(state, table);
    expect(attribute).toBeNull();
  });
});

describe('DEFAULT_TABLE_COLUMN_WIDTH', () => {
  it('is 200', () => {
    expect(DEFAULT_TABLE_COLUMN_WIDTH).toBe(200);
  });
});

describe('nextWidthsAfterColumnInsertion', () => {
  it('inserts the flat default width at the target index, never inheriting a neighboring width', () => {
    expect(nextWidthsAfterColumnInsertion([120, 80, 240], 2)).toEqual([120, 80, 200, 240]);
  });

  it('inserts at index 0', () => {
    expect(nextWidthsAfterColumnInsertion([120, 80, 240], 0)).toEqual([200, 120, 80, 240]);
  });

  it('inserts at the end', () => {
    expect(nextWidthsAfterColumnInsertion([120, 80, 240], 3)).toEqual([120, 80, 240, 200]);
  });

  it('returns null when there is no existing metadata to insert into', () => {
    expect(nextWidthsAfterColumnInsertion(null, 1)).toBeNull();
  });
});

describe('nextWidthsAfterColumnDuplication', () => {
  it('copies the source column\'s own width into the new slot immediately after it', () => {
    expect(nextWidthsAfterColumnDuplication([120, 80, 240], 1)).toEqual([120, 80, 80, 240]);
  });

  it('returns null when there is no existing metadata', () => {
    expect(nextWidthsAfterColumnDuplication(null, 1)).toBeNull();
  });
});

describe('nextWidthsAfterColumnMove', () => {
  it('moves a width from a later index to an earlier one', () => {
    expect(nextWidthsAfterColumnMove([120, 80, 240], 2, 1)).toEqual([120, 240, 80]);
  });

  it('moves a width from an earlier index to a later one', () => {
    expect(nextWidthsAfterColumnMove([120, 80, 240], 0, 1)).toEqual([80, 120, 240]);
  });

  it('returns null when there is no existing metadata', () => {
    expect(nextWidthsAfterColumnMove(null, 0, 1)).toBeNull();
  });
});

describe('nextWidthsAfterColumnDeletion', () => {
  it('removes the first column\'s width', () => {
    expect(nextWidthsAfterColumnDeletion([120, 80, 240], 0)).toEqual([80, 240]);
  });

  it('removes a middle column\'s width', () => {
    expect(nextWidthsAfterColumnDeletion([120, 80, 240], 1)).toEqual([120, 240]);
  });

  it('removes the last column\'s width', () => {
    expect(nextWidthsAfterColumnDeletion([120, 80, 240], 2)).toEqual([120, 80]);
  });

  it('returns null when there is no existing metadata', () => {
    expect(nextWidthsAfterColumnDeletion(null, 0)).toBeNull();
  });
});

describe('materializeWidthsForResize', () => {
  it('materializes the full array on a first resize, using the default for every untouched column', () => {
    expect(materializeWidthsForResize(null, 3, 2, 320)).toEqual([200, 200, 320]);
  });

  it('never produces a partial/blank representation on first resize', () => {
    const result = materializeWidthsForResize(null, 3, 2, 320);
    expect(result).toHaveLength(3);
    expect(result.every((w) => typeof w === 'number' && w >= 1)).toBe(true);
  });

  it('on a subsequent resize, changes only the resized column and preserves every other explicit value', () => {
    expect(materializeWidthsForResize([120, 80, 240], 3, 1, 999)).toEqual([120, 999, 240]);
  });

  it('falls back to the default for a column missing from a shorter existing array', () => {
    expect(materializeWidthsForResize([120, 80], 3, 2, 50)).toEqual([120, 80, 50]);
  });
});

describe('MIN_TABLE_COLUMN_WIDTH', () => {
  it('is 60', () => {
    expect(MIN_TABLE_COLUMN_WIDTH).toBe(60);
  });
});

describe('computeTableColumnWidthsCommitChange', () => {
  it('inserts a brand-new attribute line right after the table when none existed', () => {
    const doc = SIMPLE_TABLE;
    const state = stateFor(doc);
    const table = findAllTables(state)[0]!;
    const change = computeTableColumnWidthsCommitChange(state, table, [320, 200, 200]);
    expect(change).toEqual({ from: table.to, to: table.to, insert: '\n{table-col-widths="320,200,200"}' });
  });

  it('replaces an existing valid attribute line in place', () => {
    const doc = `${SIMPLE_TABLE}\n{table-col-widths="120,80,240"}`;
    const state = stateFor(doc);
    const table = findAllTables(state)[0]!;
    const attribute = resolveTableColumnWidths(state, table)!;
    const change = computeTableColumnWidthsCommitChange(state, table, [120, 999, 240]);
    expect(change).toEqual({ from: attribute.from, to: attribute.to, insert: '{table-col-widths="120,999,240"}' });
  });

  it('applying the insertion change to the document produces a valid, resolvable attribute', () => {
    const doc = SIMPLE_TABLE;
    const state = stateFor(doc);
    const table = findAllTables(state)[0]!;
    const change = computeTableColumnWidthsCommitChange(state, table, [320, 200, 200]);
    const nextDoc = state.changes(change).apply(state.doc).toString();
    const nextState = stateFor(nextDoc);
    const nextTable = findAllTables(nextState)[0]!;
    expect(resolveTableColumnWidths(nextState, nextTable)?.widths).toEqual([320, 200, 200]);
  });

  it('replaces a malformed existing attribute line in place, rather than inserting a second one (the duplicate-line regression)', () => {
    // The exact reproduction: a prior resize left a fractional, invalid
    // width — `resolveTableColumnWidths` correctly reports this as `null`
    // (no valid metadata), but a real line still physically occupies the
    // position right after the table, and it must be the one overwritten.
    const doc = `${SIMPLE_TABLE}\n{table-col-widths="70.96875,80,240"}`;
    const state = stateFor(doc);
    const table = findAllTables(state)[0]!;
    expect(resolveTableColumnWidths(state, table)).toBeNull(); // confirms the malformed premise

    const change = computeTableColumnWidthsCommitChange(state, table, [60, 60, 240]);
    const nextDoc = state.changes(change).apply(state.doc).toString();
    const lines = nextDoc.split('\n');
    const attributeLines = lines.filter((line) => line.startsWith('{table-col-widths'));
    expect(attributeLines).toEqual(['{table-col-widths="60,60,240"}']); // exactly one, not two
  });

  it('replaces a stale-column-count existing attribute line in place, rather than inserting a second one', () => {
    // Same failure mode, different cause: a count mismatch (e.g. left
    // behind by an edit) is also `null` per `resolveTableColumnWidths`,
    // but the line is still real and must still be overwritten in place.
    const doc = `${SIMPLE_TABLE}\n{table-col-widths="120,80"}`;
    const state = stateFor(doc);
    const table = findAllTables(state)[0]!;
    expect(resolveTableColumnWidths(state, table)).toBeNull();

    const change = computeTableColumnWidthsCommitChange(state, table, [60, 80, 240]);
    const nextDoc = state.changes(change).apply(state.doc).toString();
    const attributeLines = nextDoc.split('\n').filter((line) => line.startsWith('{table-col-widths'));
    expect(attributeLines).toEqual(['{table-col-widths="60,80,240"}']);
  });

  it('never creates a third line when a duplicate already exists — replaces only the immediately-adjacent one, leaving the stale second line untouched (documented, not auto-healed)', () => {
    const doc = `${SIMPLE_TABLE}\n{table-col-widths="60,60,240"}\n{table-col-widths="70.96875,80,240"}`;
    const state = stateFor(doc);
    const table = findAllTables(state)[0]!;

    const change = computeTableColumnWidthsCommitChange(state, table, [100, 60, 240]);
    const nextDoc = state.changes(change).apply(state.doc).toString();
    const attributeLines = nextDoc.split('\n').filter((line) => line.startsWith('{table-col-widths'));

    expect(attributeLines).toHaveLength(2); // still two — not fixed, but never made worse (a third)
    expect(attributeLines[0]).toBe('{table-col-widths="100,60,240"}'); // the immediately-adjacent one was overwritten
    expect(attributeLines[1]).toBe('{table-col-widths="70.96875,80,240"}'); // the stale second line is left exactly as it was
  });
});

describe('resolveExistingAttributeLineRange', () => {
  it('finds a valid attribute line', () => {
    const doc = `${SIMPLE_TABLE}\n{table-col-widths="120,80,240"}`;
    const state = stateFor(doc);
    const table = findAllTables(state)[0]!;
    const range = resolveExistingAttributeLineRange(state, table);
    expect(range).not.toBeNull();
    expect(state.sliceDoc(range!.from, range!.to)).toBe('{table-col-widths="120,80,240"}');
  });

  it('finds a malformed (invalid-value) attribute line — unlike resolveTableColumnWidths, which returns null for it', () => {
    const doc = `${SIMPLE_TABLE}\n{table-col-widths="70.96875,80,240"}`;
    const state = stateFor(doc);
    const table = findAllTables(state)[0]!;
    expect(resolveTableColumnWidths(state, table)).toBeNull();
    const range = resolveExistingAttributeLineRange(state, table);
    expect(range).not.toBeNull();
    expect(state.sliceDoc(range!.from, range!.to)).toBe('{table-col-widths="70.96875,80,240"}');
  });

  it('finds a stale-column-count attribute line too', () => {
    const doc = `${SIMPLE_TABLE}\n{table-col-widths="120,80"}`;
    const state = stateFor(doc);
    const table = findAllTables(state)[0]!;
    const range = resolveExistingAttributeLineRange(state, table);
    expect(range).not.toBeNull();
  });

  it('returns null for an unrelated paragraph after the table', () => {
    const doc = `${SIMPLE_TABLE}\n{.some-other-attribute}`;
    const state = stateFor(doc);
    const table = findAllTables(state)[0]!;
    expect(resolveExistingAttributeLineRange(state, table)).toBeNull();
  });

  it('returns null when no metadata exists at all', () => {
    const state = stateFor(SIMPLE_TABLE);
    const table = findAllTables(state)[0]!;
    expect(resolveExistingAttributeLineRange(state, table)).toBeNull();
  });
});
