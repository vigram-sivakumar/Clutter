import { describe, expect, it } from 'vitest';

import { buildPropertyTableColumns } from '../../properties/tableColumns';
import { folderEntry } from '../../testing/collectionEntry';
import { folderSummary, toFolderListItem, toFolderTableRow } from './toFolderListItem';

describe('folderSummary — what a folder holds, as one line', () => {
  it('"0 subfolders · 2 notes", pluralized', () => {
    expect(folderSummary(folderEntry({ subfolderCount: 0, noteCount: 2 }))).toBe('0 subfolders · 2 notes');
    expect(folderSummary(folderEntry({ subfolderCount: 1, noteCount: 1 }))).toBe('1 subfolder · 1 note');
    expect(folderSummary(folderEntry({ subfolderCount: 3, noteCount: 0 }))).toBe('3 subfolders · 0 notes');
  });

  it('is absent for a folder that carries no counts (a Daily Notes year)', () => {
    expect(folderSummary(folderEntry())).toBeUndefined();
  });
});

describe('toFolderListItem / toFolderTableRow — a folder as an item of the generic list and table', () => {
  const entry = folderEntry({ title: 'Projects', subfolderCount: 0, noteCount: 2, archived: '2026-08-12T14:20:00.000Z' });

  it('the summary is the first trailing value, never the description (a folder has none in a list)', () => {
    const item = toFolderListItem(folderEntry({ title: 'P', description: 'About', subfolderCount: 1, noteCount: 0 }), { visible: ['name', 'description'] });

    expect(item.description).toBeUndefined();
    expect(item.metadata).toEqual(['1 subfolder · 0 notes']);
    expect(item.icon).toBe('folder');
  });

  it('after the summary, metadata is the visible plain-value properties the folder has a value for — here its archive date', () => {
    expect(toFolderListItem(entry, { visible: ['name', 'archived'] }).metadata).toHaveLength(2);
    expect(toFolderListItem(entry, { visible: ['name', 'created', 'size'] }).metadata).toEqual(['0 subfolders · 2 notes']);
  });

  it('a folder with no counts and no visible values has no metadata at all', () => {
    expect(toFolderListItem(folderEntry({ title: 'Year' }), { visible: ['name'] }).metadata).toEqual([]);
  });

  it('the table row has the same name cell and summary, then one cell per visible value property', () => {
    const row = toFolderTableRow(entry, { visible: ['name', 'archived'] });

    expect(row.cells.name).toMatchObject({ variant: 'header', title: 'Projects', description: '0 subfolders · 2 notes' });
    expect(Object.keys(row.cells)).toEqual(['name', 'archived']);
  });
});

describe('buildPropertyTableColumns — columns that are not properties', () => {
  it('extra columns sit right after Name, before the properties, and carry their own header', () => {
    const columns = buildPropertyTableColumns(['name', 'size', 'archived'], { extraColumns: [{ id: 'type', label: 'Type' }] });

    expect(columns.map((c) => [c.id, c.label])).toEqual([
      ['name', 'Name'],
      ['type', 'Type'],
      ['size', 'File size'],
      ['archived', 'Delete'],
    ]);
  });
});
