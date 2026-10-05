import { describe, expect, it } from 'vitest';

import type { PropertyId, PropertyValues } from './collectionProperties';
import { sortEntries, type CollectionSort } from './collectionSort';

interface Row {
  readonly id: string;
  readonly values: PropertyValues;
}

const row = (name: string, values: PropertyValues = {}, id = name): Row => ({ id, values: { name, ...values } });
const ids = (rows: readonly Row[]) => rows.map((r) => r.id);
const by = (property: PropertyId, direction: CollectionSort['direction'] = 'down'): CollectionSort => ({ property, direction });
const iso = (day: number) => `2026-01-${String(day).padStart(2, '0')}T00:00:00.000Z`;

describe('sortEntries — text (name, description)', () => {
  it('down is A→Z, up is Z→A', () => {
    const rows = [row('Charlie'), row('Alpha'), row('Bravo')];

    expect(ids(sortEntries(rows, by('name', 'down')))).toEqual(['Alpha', 'Bravo', 'Charlie']);
    expect(ids(sortEntries(rows, by('name', 'up')))).toEqual(['Charlie', 'Bravo', 'Alpha']);
  });

  it('is plain localeCompare, NOT natural numeric order: "Project 10" sorts before "Project 2"', () => {
    const rows = [row('Project 2'), row('Project 10'), row('Project 1')];

    expect(ids(sortEntries(rows, by('name', 'down')))).toEqual(['Project 1', 'Project 10', 'Project 2']);
  });

  it('is locale-aware, not code-point order: "apple" before "Banana"', () => {
    expect(ids(sortEntries([row('Banana'), row('apple')], by('name')))).toEqual(['apple', 'Banana']);
  });

  it('a missing or blank description sorts last in BOTH directions', () => {
    const rows = [
      row('None'),
      row('Blank', { description: '   ' }),
      row('Banana', { description: 'banana' }),
      row('Apple', { description: 'apple' }),
    ];

    expect(ids(sortEntries(rows, by('description', 'down')))).toEqual(['Apple', 'Banana', 'None', 'Blank']);
    expect(ids(sortEntries(rows, by('description', 'up')))).toEqual(['Banana', 'Apple', 'None', 'Blank']);
  });
});

describe('sortEntries — date (created, updated, archived)', () => {
  const old = row('Old', { created: iso(1), updated: iso(1), archived: iso(1) });
  const mid = row('Mid', { created: iso(2), updated: iso(2), archived: iso(2) });
  const fresh = row('Fresh', { created: iso(3), updated: iso(3), archived: iso(3) });

  it('down is newest first, up is oldest first — for every date property', () => {
    for (const property of ['created', 'updated', 'archived'] as const) {
      expect(ids(sortEntries([old, fresh, mid], by(property, 'down'))), property).toEqual(['Fresh', 'Mid', 'Old']);
      expect(ids(sortEntries([old, fresh, mid], by(property, 'up'))), property).toEqual(['Old', 'Mid', 'Fresh']);
    }
  });

  it('an item with no date sorts last in BOTH directions', () => {
    const none = row('None');

    expect(ids(sortEntries([none, mid, old], by('created', 'down')))).toEqual(['Mid', 'Old', 'None']);
    expect(ids(sortEntries([none, mid, old], by('created', 'up')))).toEqual(['Old', 'Mid', 'None']);
  });
});

describe('sortEntries — number (size)', () => {
  const small = row('small', { size: 1 });
  const large = row('large', { size: 9000 });
  const medium = row('medium', { size: 50 });

  it('down is largest first, up is smallest first', () => {
    expect(ids(sortEntries([small, large, medium], by('size', 'down')))).toEqual(['large', 'medium', 'small']);
    expect(ids(sortEntries([small, large, medium], by('size', 'up')))).toEqual(['small', 'medium', 'large']);
  });

  it('compares numerically, not as text; a zero size is a real size, not a missing one', () => {
    const empty = row('empty', { size: 0 });

    expect(ids(sortEntries([empty, row('ten', { size: 10 }), row('two', { size: 2 })], by('size', 'down')))).toEqual([
      'ten',
      'two',
      'empty',
    ]);
  });

  it('an item with no size sorts last in BOTH directions', () => {
    const none = row('none');

    expect(ids(sortEntries([none, small, large], by('size', 'down'))).at(-1)).toBe('none');
    expect(ids(sortEntries([none, small, large], by('size', 'up'))).at(-1)).toBe('none');
  });
});

describe('sortEntries — presence (cover)', () => {
  const covered = row('Covered', { cover: 'Assets/a.png' });
  const another = row('Another', { cover: 'Assets/b.png' });
  const bare = row('Bare');

  it('down puts the items that have a value first; up puts them last (presence is not "missing last")', () => {
    expect(ids(sortEntries([bare, covered, another], by('cover', 'down')))).toEqual(['Covered', 'Another', 'Bare']);
    expect(ids(sortEntries([bare, covered, another], by('cover', 'up')))).toEqual(['Bare', 'Covered', 'Another']);
  });

  it('does not order by the value itself: two covers keep their input order', () => {
    expect(ids(sortEntries([another, covered], by('cover', 'down')))).toEqual(['Another', 'Covered']);
  });
});

describe('sortEntries — stable ties', () => {
  it('equal values keep the input order, in either direction, when no name tie-break is named', () => {
    const zed = row('Zed', { created: iso(5) });
    const alpha = row('Alpha', { created: iso(5) });

    expect(ids(sortEntries([zed, alpha], by('created', 'down')))).toEqual(['Zed', 'Alpha']);
    expect(ids(sortEntries([zed, alpha], by('created', 'up')))).toEqual(['Zed', 'Alpha']);
  });

  it('two items with no value keep the input order', () => {
    expect(ids(sortEntries([row('Zed'), row('Alpha')], by('updated')))).toEqual(['Zed', 'Alpha']);
  });

  it('equal names keep the input order — Name itself never has a tie-break', () => {
    const first = row('Same', {}, 'first');
    const second = row('Same', {}, 'second');

    expect(ids(sortEntries([second, first], by('name', 'down')))).toEqual(['second', 'first']);
    expect(ids(sortEntries([second, first], by('name', 'up')))).toEqual(['second', 'first']);
  });
});

describe('sortEntries — the optional name tie-break (preserves today\'s per-collection asymmetry)', () => {
  const tie = new Set<PropertyId>(['description', 'cover', 'size']);

  it('breaks ties of ONLY the named properties by name A→Z, whichever the direction', () => {
    const zed = row('Zed', { description: 'same', created: iso(5) });
    const alpha = row('Alpha', { description: 'same', created: iso(5) });

    for (const direction of ['down', 'up'] as const) {
      expect(ids(sortEntries([zed, alpha], by('description', direction), { nameTieBreak: tie }))).toEqual(['Alpha', 'Zed']);
      // created is not named, so its tie stays in input order.
      expect(ids(sortEntries([zed, alpha], by('created', direction), { nameTieBreak: tie }))).toEqual(['Zed', 'Alpha']);
    }
  });

  it('also orders two items that both have no value by name', () => {
    expect(ids(sortEntries([row('Zed'), row('Alpha')], by('size'), { nameTieBreak: tie }))).toEqual(['Alpha', 'Zed']);
    expect(ids(sortEntries([row('Zed'), row('Alpha')], by('cover'), { nameTieBreak: tie }))).toEqual(['Alpha', 'Zed']);
  });
});

describe('sortEntries — general', () => {
  it('never mutates its input and returns a new array', () => {
    const rows = [row('B'), row('A')];
    const sorted = sortEntries(rows, by('name'));

    expect(ids(rows)).toEqual(['B', 'A']);
    expect(sorted).not.toBe(rows);
  });

  it('a property no item has a value for leaves the order as given (folders have no dates; notes have no size)', () => {
    const rows = [row('B'), row('A')];

    expect(ids(sortEntries(rows, by('size')))).toEqual(['B', 'A']);
    expect(ids(sortEntries(rows, by('created')))).toEqual(['B', 'A']);
  });

  it('orders items of any domain that carry values — it never looks at what the item is', () => {
    const rows = [
      { id: 'asset', kind: 'asset', values: { name: 'b.png', size: 5 } },
      { id: 'note', kind: 'note', values: { name: 'a note' } },
    ];

    expect(sortEntries(rows, by('size', 'down')).map((r) => r.id)).toEqual(['asset', 'note']);
  });
});
