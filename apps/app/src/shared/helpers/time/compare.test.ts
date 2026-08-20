import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  isAfter,
  isBefore,
  isCurrentMonth,
  isCurrentYear,
  isFuture,
  isPast,
  isSame,
  isToday,
  isTomorrow,
  isYesterday,
} from './compare';

describe('compare', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 20)); // local 2026-08-20
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('isToday is true for the current local date exactly at the day boundary', () => {
    // Regression: with the old UTC-parsing toDate(), this could evaluate to
    // false for "today" in a negative-UTC-offset timezone, since the ISO
    // string would parse to the previous local day.
    expect(isToday('2026-08-20')).toBe(true);
    expect(isToday('2026-08-19')).toBe(false);
    expect(isToday('2026-08-21')).toBe(false);
  });

  it('isYesterday/isTomorrow are relative to local "now"', () => {
    expect(isYesterday('2026-08-19')).toBe(true);
    expect(isTomorrow('2026-08-21')).toBe(true);
    expect(isYesterday('2026-08-20')).toBe(false);
    expect(isTomorrow('2026-08-20')).toBe(false);
  });

  it('isPast/isFuture classify a date due exactly today as neither — the concrete overdue-misclassification scenario', () => {
    expect(isPast('2026-08-20')).toBe(false);
    expect(isFuture('2026-08-20')).toBe(false);
    expect(isPast('2026-08-19')).toBe(true);
    expect(isFuture('2026-08-21')).toBe(true);
  });

  it('isSame compares calendar identity, not just numeric equality of the underlying timestamps', () => {
    expect(isSame('2026-08-20', '2026-08-20')).toBe(true);
    expect(isSame('2026-08-20', '2026-08-21')).toBe(false);
  });

  it('isBefore/isAfter are exact at a year boundary', () => {
    expect(isBefore('2025-12-31', '2026-01-01')).toBe(true);
    expect(isAfter('2026-01-01', '2025-12-31')).toBe(true);
    expect(isBefore('2026-01-01', '2026-01-01')).toBe(false);
    expect(isAfter('2026-01-01', '2026-01-01')).toBe(false);
  });

  it('isCurrentMonth/isCurrentYear are exact at their respective boundaries', () => {
    expect(isCurrentMonth('2026-08-01')).toBe(true);
    expect(isCurrentMonth('2026-07-31')).toBe(false);
    expect(isCurrentYear('2026-01-01')).toBe(true);
    expect(isCurrentYear('2025-12-31')).toBe(false);
  });
});
