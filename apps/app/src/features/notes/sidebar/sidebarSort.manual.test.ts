import { describe, expect, it } from 'vitest';
import { placeInOrder, sortLevelEntries, levelEntryOrderId } from './sidebarSort';
import { defaultSidebarSortDirection, normalizeSidebarOrder, sidebarOrderId, type SidebarSort } from '@core/properties/sidebarSort';
import type { Folder } from '@core/vault/models';
import type { EffectivePage } from '@core/application/page/EffectivePageState';

const MANUAL: SidebarSort = { key: 'manual', direction: 'down' };
const BY_NAME: SidebarSort = { key: 'name', direction: 'down' };
const CREATED_OLDEST: SidebarSort = { key: 'created', direction: 'up' };
const EDITED_NEWEST: SidebarSort = { key: 'updated', direction: 'down' };

function folder(id: string, name: string): Folder {
  return {
    id,
    name,
    path: `/v/${name}`,
    parentId: null,
    metadata: { icon: null, favorite: false, description: null, cover: null, coverHidden: false, coverLayout: 'side', coverPositionAbove: 50, coverPositionSide: 50, defaultTemplateId: null, status: 'active', archivedAt: null, originalPath: null, originalParentId: null },
  } as Folder;
}

function page(id: string, name: string, dates: { createdAt?: string | null; updatedAt?: string | null } = {}): EffectivePage {
  return { id, name, title: name, isDraft: false, createdAt: dates.createdAt ?? null, updatedAt: dates.updatedAt ?? null } as unknown as EffectivePage;
}

/** `kind:id` for each entry, in order — notes as n:, folders as f:. */
const seq = (entries: ReturnType<typeof sortLevelEntries>) => entries.map(levelEntryOrderId);

describe('sort semantics: notes and folders are one sibling sequence', () => {
  const folders = [folder('fb', 'Banana'), folder('fd', 'date')];
  const pages = [page('na', 'Apple'), page('nc', 'Cherry')];

  it('Name: alphabetical across both kinds, case-insensitively', () => {
    expect(seq(sortLevelEntries(folders, pages, BY_NAME, undefined))).toEqual(['n:na', 'f:fb', 'n:nc', 'f:fd']);
    expect(seq(sortLevelEntries(folders, pages, { key: 'name', direction: 'up' }, undefined))).toEqual(['f:fd', 'n:nc', 'f:fb', 'n:na']);
  });

  it('no stored sort reads as Name, and a retired Kind sort reads as Name too', () => {
    const expected = ['n:na', 'f:fb', 'n:nc', 'f:fd'];
    expect(seq(sortLevelEntries(folders, pages, undefined, undefined))).toEqual(expected);
    expect(seq(sortLevelEntries(folders, pages, { key: 'kind', direction: 'down' }, undefined))).toEqual(expected);
  });

  it('ties between identical names are broken by id, so the order is the same on every run and every input order', () => {
    const twins = [page('n2', 'Same'), page('n1', 'Same'), page('n3', 'Same')];
    const a = seq(sortLevelEntries([], twins, BY_NAME, undefined));
    const b = seq(sortLevelEntries([], [...twins].reverse(), BY_NAME, undefined));
    expect(a).toEqual(['n:n1', 'n:n2', 'n:n3']);
    expect(b).toEqual(a);
  });

  it('Created time: oldest first, notes with a date before everything undated; folders (no date) after, by name', () => {
    const dated = [
      page('new', 'Zeta', { createdAt: '2026-03-01T00:00:00.000Z' }),
      page('old', 'Yankee', { createdAt: '2026-01-01T00:00:00.000Z' }),
      page('undated', 'Alpha'),
    ];
    expect(seq(sortLevelEntries(folders, dated, CREATED_OLDEST, undefined))).toEqual(['n:old', 'n:new', 'n:undated', 'f:fb', 'f:fd']);
  });

  it('Last edited: most recently edited first', () => {
    const dated = [
      page('a', 'Alpha', { updatedAt: '2026-01-01T00:00:00.000Z' }),
      page('b', 'Bravo', { updatedAt: '2026-06-01T00:00:00.000Z' }),
      page('c', 'Charlie', { updatedAt: '2026-03-01T00:00:00.000Z' }),
    ];
    expect(seq(sortLevelEntries([], dated, EDITED_NEWEST, undefined))).toEqual(['n:b', 'n:c', 'n:a']);
  });

  it('equal timestamps fall back to name, A→Z, in either direction', () => {
    const same = '2026-02-02T00:00:00.000Z';
    const tied = [page('z', 'Zulu', { createdAt: same, updatedAt: same }), page('a', 'Alpha', { createdAt: same, updatedAt: same })];
    expect(seq(sortLevelEntries([], tied, CREATED_OLDEST, undefined))).toEqual(['n:a', 'n:z']);
    expect(seq(sortLevelEntries([], tied, { key: 'created', direction: 'down' }, undefined))).toEqual(['n:a', 'n:z']);
    expect(seq(sortLevelEntries([], tied, EDITED_NEWEST, undefined))).toEqual(['n:a', 'n:z']);
  });

  it('missing, blank or unparseable timestamps never crash and sort deterministically after the dated ones', () => {
    const odd = [
      page('blank', 'Blank', { createdAt: '   ' }),
      page('bad', 'Bad', { createdAt: 'not a date' }),
      page('ok', 'Ok', { createdAt: '2026-01-01T00:00:00.000Z' }),
      page('none', 'None'),
    ];
    const result = seq(sortLevelEntries([], odd, CREATED_OLDEST, undefined));
    expect(result[0]).toBe('n:ok');
    expect(seq(sortLevelEntries([], [...odd].reverse(), CREATED_OLDEST, undefined))).toEqual(result);
    expect(result).toHaveLength(4);
  });

  it('never mutates its inputs', () => {
    const input = [page('b', 'B'), page('a', 'A')];
    sortLevelEntries([], input, BY_NAME, undefined);
    expect(input.map((p) => p.id)).toEqual(['b', 'a']);
  });
});

describe('Manual', () => {
  const folders = [folder('a', 'Apple'), folder('b', 'Banana'), folder('c', 'Cherry'), folder('d', 'Date')];

  it('listed items follow their stored positions', () => {
    expect(seq(sortLevelEntries(folders, [], MANUAL, ['f:c', 'f:a', 'f:d', 'f:b']))).toEqual(['f:c', 'f:a', 'f:d', 'f:b']);
  });

  it('notes and folders interleave freely in the stored order', () => {
    const pages = [page('n1', 'Note')];
    expect(seq(sortLevelEntries(folders.slice(0, 2), pages, MANUAL, ['f:b', 'n:n1', 'f:a']))).toEqual(['f:b', 'n:n1', 'f:a']);
  });

  it('unlisted items follow the listed ones, by name, notes and folders together', () => {
    const result = seq(sortLevelEntries([...folders, folder('z', 'Zed')], [page('n', 'Berry')], MANUAL, ['f:c']));
    expect(result).toEqual(['f:c', 'f:a', 'f:b', 'n:n', 'f:d', 'f:z']);
  });

  it('ignores ids that match nothing and counts a repeated id once, at its first position', () => {
    expect(seq(sortLevelEntries(folders, [], MANUAL, ['f:ghost', 'f:d', 'f:b', 'f:d', 'f:gone']))).toEqual(['f:d', 'f:b', 'f:a', 'f:c']);
  });

  it('with no list at all, orders everything by name — and a non-manual sort ignores a stored list', () => {
    expect(seq(sortLevelEntries(folders, [], MANUAL, undefined))).toEqual(['f:a', 'f:b', 'f:c', 'f:d']);
    expect(seq(sortLevelEntries(folders, [], BY_NAME, ['f:d']))).toEqual(['f:a', 'f:b', 'f:c', 'f:d']);
  });

  it('a note id and a folder id that match never collide: kinds are prefixed', () => {
    expect(sidebarOrderId('folder', 'x')).not.toBe(sidebarOrderId('note', 'x'));
    expect(seq(sortLevelEntries([folder('x', 'X')], [page('x', 'Y')], MANUAL, ['n:x', 'f:x']))).toEqual(['n:x', 'f:x']);
  });
});

describe('placeInOrder', () => {
  const order = ['f:a', 'n:b', 'f:c', 'n:d'];

  it('moves an item before or after an anchor', () => {
    expect(placeInOrder(order, 'f:c', 'f:a', 'before')).toEqual(['f:c', 'f:a', 'n:b', 'n:d']);
    expect(placeInOrder(order, 'f:a', 'f:c', 'after')).toEqual(['n:b', 'f:c', 'f:a', 'n:d']);
  });

  it('places an item that is not in the list yet (a just-moved one)', () => {
    expect(placeInOrder(order, 'f:new', 'n:b', 'before')).toEqual(['f:a', 'f:new', 'n:b', 'f:c', 'n:d']);
  });

  it('is a no-op for an unknown anchor or the item itself, and never mutates its input', () => {
    expect(placeInOrder(order, 'f:a', 'f:nope', 'after')).toEqual(order);
    expect(placeInOrder(order, 'f:a', 'f:a', 'after')).toEqual(order);
    expect(order).toEqual(['f:a', 'n:b', 'f:c', 'n:d']);
  });
});

describe('defaults and parsing', () => {
  it('each key starts in the direction the spec names', () => {
    expect(defaultSidebarSortDirection('name')).toBe('down'); // A→Z
    expect(defaultSidebarSortDirection('created')).toBe('up'); // oldest first
    expect(defaultSidebarSortDirection('updated')).toBe('down'); // most recently edited first
  });

  it('a stored order keeps the first occurrence of each string and nothing else', () => {
    expect(normalizeSidebarOrder(['a', 'b', 'a', 1, '', 'c'])).toEqual(['a', 'b', 'c']);
    expect(normalizeSidebarOrder([])).toBeUndefined();
    expect(normalizeSidebarOrder('a')).toBeUndefined();
  });
});
