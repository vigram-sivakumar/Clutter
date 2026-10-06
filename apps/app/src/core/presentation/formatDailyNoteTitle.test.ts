import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  formatDailyNoteDateLabel,
  formatDailyNotePickerTitle,
  formatDailyNoteTitle,
} from './formatDailyNoteTitle';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 4, 12)); // Sunday 4 Oct 2026
});
afterEach(() => vi.useRealTimers());

describe('formatDailyNoteDateLabel — the date alone, for every surface but the Daily Note page', () => {
  it.each([
    ['2026-10-04', '4 October 2026'], // today: no "Today,"
    ['2026-10-03', '3 October 2026'], // yesterday: no "Yesterday,"
    ['2026-10-07', '7 October 2026'], // this week: no weekday
    ['2025-12-31', '31 December 2025'],
  ])('%s reads %s', (name, expected) => {
    expect(formatDailyNoteDateLabel(name)).toBe(expected);
  });

  it('leaves a malformed name as it is', () => {
    expect(formatDailyNoteDateLabel('not-a-date')).toBe('not-a-date');
  });
});

describe('formatDailyNoteTitle — the Daily Note page title keeps the full date', () => {
  it.each([
    ['2026-10-04', 'Today, 4 October 2026'],
    ['2026-10-03', 'Yesterday, 3 October 2026'],
    ['2026-10-05', 'Tomorrow, 5 October 2026'],
    ['2026-10-07', 'Wednesday, 7 October 2026'],
    ['2026-10-02', 'Friday, 2 October 2026'],
    ['2025-12-31', 'Wednesday, 31 December 2025'],
  ])('%s reads %s', (name, expected) => {
    expect(formatDailyNoteTitle(name)).toBe(expected);
  });

  it('leaves a malformed name as it is', () => {
    expect(formatDailyNoteTitle('not-a-date')).toBe('not-a-date');
  });
});

describe('formatDailyNotePickerTitle — a Daily Note as one row of the note picker is short and relative', () => {
  it.each([
    ['2026-10-04', 'Today'],
    ['2026-10-03', 'Yesterday'],
    ['2026-10-05', 'Tomorrow'],
    ['2026-10-07', 'Wednesday'],
    ['2026-10-02', '2 Oct'],
    ['2026-03-15', '15 Mar'],
    ['2025-12-31', '31 Dec 2025'],
  ])('%s reads %s', (name, expected) => {
    expect(formatDailyNotePickerTitle(name)).toBe(expected);
  });

  it('leaves a malformed name as it is', () => {
    expect(formatDailyNotePickerTitle('not-a-date')).toBe('not-a-date');
  });
});
