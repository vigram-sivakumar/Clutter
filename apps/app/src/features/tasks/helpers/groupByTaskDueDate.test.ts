import { describe, expect, it } from 'vitest';
import { groupByTaskDueDate } from './groupByTaskDueDate';

describe('groupByTaskDueDate', () => {
  it('orders calendar dates, preserves each date’s input order and puts invalid or missing dates last', () => {
    const items = [
      { id: 'late', dueDate: '2026-11-21' },
      { id: 'first', dueDate: '2026-11-20' },
      { id: 'missing' },
      { id: 'second', dueDate: '2026-11-20' },
      { id: 'invalid', dueDate: '2026-02-30' },
    ];
    expect(groupByTaskDueDate(items, (item) => item.dueDate)).toEqual([
      { date: '2026-11-20', items: [items[1], items[3]] },
      { date: '2026-11-21', items: [items[0]] },
      { date: '', items: [items[2], items[4]] },
    ]);
    expect(items.map((item) => item.id)).toEqual(['late', 'first', 'missing', 'second', 'invalid']);
  });

  it('has no empty groups', () => {
    expect(groupByTaskDueDate([], () => undefined)).toEqual([]);
  });
});
