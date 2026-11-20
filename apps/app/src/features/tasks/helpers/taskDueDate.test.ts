import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { classifyDueDate } from './taskDueDate';

describe('classifyDueDate — the one interpretation of a task due date', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Local noon of 2026-10-06: a date-only value is a local calendar day, whatever the clock time.
    vi.setSystemTime(new Date(2026, 9, 6, 12, 0, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('no due date → unscheduled', () => {
    expect(classifyDueDate(undefined)).toBe('unscheduled');
  });

  it('today / yesterday / tomorrow compare by local calendar day', () => {
    expect(classifyDueDate('2026-10-06')).toBe('today');
    expect(classifyDueDate('2026-10-05')).toBe('past');
    expect(classifyDueDate('2026-10-07')).toBe('future');
  });

  it('is stable across the day: just after midnight and just before it are both still the same local day', () => {
    vi.setSystemTime(new Date(2026, 9, 6, 0, 0, 1));
    expect(classifyDueDate('2026-10-06')).toBe('today');
    expect(classifyDueDate('2026-10-05')).toBe('past');

    vi.setSystemTime(new Date(2026, 9, 6, 23, 59, 59));
    expect(classifyDueDate('2026-10-06')).toBe('today');
    expect(classifyDueDate('2026-10-07')).toBe('future');
  });

  it('a shape-valid but calendar-invalid date is deterministically unscheduled — never rolled over into a real date', () => {
    for (const invalid of ['2026-13-45', '2026-02-30', '2026-00-10', '2026-10-32', 'soon', '']) {
      expect(classifyDueDate(invalid), invalid).toBe('unscheduled');
    }
  });
});
