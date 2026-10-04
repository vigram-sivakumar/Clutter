import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { formatDailyNoteTitle } from './formatDailyNoteTitle';

describe('formatDailyNoteTitle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 4, 12)); // Sunday 4 Oct 2026
  });
  afterEach(() => vi.useRealTimers());

  it.each([
    ['2026-10-04', 'Today'],
    ['2026-10-03', 'Yesterday'],
    ['2026-10-05', 'Tomorrow'],
    ['2026-10-07', 'Wednesday'],
    ['2026-10-02', '2 Oct'],
    ['2026-03-15', '15 Mar'],
    ['2025-12-31', '31 Dec 2025'],
  ])('%s reads %s', (name, expected) => {
    expect(formatDailyNoteTitle(name)).toBe(expected);
  });

  it('leaves a malformed name as it is', () => {
    expect(formatDailyNoteTitle('not-a-date')).toBe('not-a-date');
  });
});
