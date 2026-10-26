import { describe, expect, it } from 'vitest';

import { buildSelectionActionMenu } from './buildSelectionActionMenu';

const ALL = new Set(['move-to', 'toggle-favorite', 'archive']);
const menu = (over: Partial<Parameters<typeof buildSelectionActionMenu>[0]> = {}) =>
  buildSelectionActionMenu({ count: 3, total: 5, supported: ALL, allFavorite: false, ...over });

describe('buildSelectionActionMenu', () => {
  it('lists Select all, then favorite, Move to and Move to trash — the shared definitions’ wording and order', () => {
    expect(menu().map((item) => [item.id, item.label])).toEqual([
      ['select-all', 'Select all'],
      ['toggle-favorite', 'Add to favorites'],
      ['move-to', 'Move to…'],
      ['archive', 'Move to trash'],
    ]);
  });

  it('puts the dividers where the global groups change — after Select all, and before the lifecycle action', () => {
    expect(menu().map((item) => item.separatorBefore === true)).toEqual([false, true, false, true]);
  });

  it('titles the menu with the selection count, on its first item', () => {
    expect(menu({ count: 1 })[0]!.groupTitle).toBe('1 selected');
    expect(menu({ count: 12 })[0]!.groupTitle).toBe('12 selected');
    expect(menu().slice(1).some((item) => item.groupTitle !== undefined)).toBe(false);
  });

  it('reads Remove from favorites only when every selected item is a favorite', () => {
    expect(menu({ allFavorite: true }).find((item) => item.id === 'toggle-favorite')!.label).toBe('Remove from favorites');
    expect(menu({ allFavorite: false }).find((item) => item.id === 'toggle-favorite')!.label).toBe('Add to favorites');
  });

  it('leaves out an action not every item supports, and the divider that went with it', () => {
    const items = menu({ supported: new Set(['move-to', 'archive']) });

    expect(items.map((item) => item.id)).toEqual(['select-all', 'move-to', 'archive']);

    const onlySelection = menu({ supported: new Set() });
    expect(onlySelection.map((item) => item.id)).toEqual(['select-all']);
    expect(onlySelection.some((item) => item.separatorBefore)).toBe(false);
  });
});

describe('buildSelectionActionMenu — the Select all checkbox', () => {
  const icon = (count: number, total: number) =>
    buildSelectionActionMenu({ count, total, supported: ALL, allFavorite: false }).find((item) => item.id === 'select-all')!.icon;

  it('is an empty circle with nothing selected, a circle with a minus with some, and the filled, ticked one with all', () => {
    expect(icon(0, 4)).toBe('checkboxUnchecked');
    expect(icon(1, 4)).toBe('checkboxIndeterminate');
    expect(icon(3, 4)).toBe('checkboxIndeterminate');
    expect(icon(4, 4)).toBe('checkboxChecked');
  });

  it('is one item that reads Select all until everything is selected, then Deselect all', () => {
    const label = (count: number, total: number) =>
      buildSelectionActionMenu({ count, total, supported: ALL, allFavorite: false }).find((item) => item.id === 'select-all')!.label;

    expect(label(0, 4)).toBe('Select all');
    expect(label(2, 4)).toBe('Select all');
    expect(label(4, 4)).toBe('Deselect all');
  });

  it('treats a lone item as all selected once it is', () => {
    expect(icon(1, 1)).toBe('checkboxChecked');
  });
});

describe('buildSelectionActionMenu — Delete', () => {
  const all = new Set(['move-to', 'toggle-favorite', 'archive', 'delete']);

  it('is the last action, in the destructive group — a divider of its own — and distinct from Move to trash', () => {
    const items = buildSelectionActionMenu({ count: 2, total: 5, supported: all, allFavorite: false });

    expect(items.map((item) => item.id)).toEqual(['select-all', 'toggle-favorite', 'move-to', 'archive', 'delete']);
    const del = items.at(-1)!;
    expect(del.label).toBe('Delete permanently');
    expect(del.icon).toBe('trash');
    expect(del.variant).toBe('danger');
    expect(del.separatorBefore).toBe(true);
    expect(items.find((item) => item.id === 'archive')!.label).toBe('Move to trash');
  });

  it('is left out unless every item supports it', () => {
    const items = buildSelectionActionMenu({ count: 2, total: 5, supported: new Set(['archive']), allFavorite: false });

    expect(items.map((item) => item.id)).not.toContain('delete');
  });
});

describe('buildSelectionActionMenu — Restore (the Trash)', () => {
  it('offers only Restore and Delete permanently beside Select all when that is all the items support, each in its own group', () => {
    const items = buildSelectionActionMenu({ count: 3, total: 5, supported: new Set(['restore', 'delete']), allFavorite: false });

    expect(items.map((item) => [item.id, item.label])).toEqual([
      ['select-all', 'Select all'],
      ['restore', 'Restore'],
      ['delete', 'Delete permanently'],
    ]);
    expect(items.map((item) => item.separatorBefore === true)).toEqual([false, true, true]);
  });
});
