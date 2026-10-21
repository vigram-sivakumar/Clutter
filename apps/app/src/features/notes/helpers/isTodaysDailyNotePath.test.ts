import { afterEach, describe, expect, it } from 'vitest';

import { isTodaysDailyNotePath } from './templateSuggestions';

const path = (iso: string) => `/vault/Daily Notes/${iso.slice(0, 4)}/October/${iso}.md`;

describe('isTodaysDailyNotePath — local calendar, never UTC', () => {
  const original = process.env.TZ;
  afterEach(() => {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  });

  it('is true only for the note named for today, false for yesterday and tomorrow', () => {
    const now = new Date(2026, 9, 20, 12);

    expect(isTodaysDailyNotePath(path('2026-10-20'), now)).toBe(true);
    expect(isTodaysDailyNotePath(path('2026-10-19'), now)).toBe(false);
    expect(isTodaysDailyNotePath(path('2026-10-21'), now)).toBe(false);
    expect(isTodaysDailyNotePath(path('2025-10-20'), now)).toBe(false);
  });

  it('turns over at local midnight', () => {
    expect(isTodaysDailyNotePath(path('2026-10-20'), new Date(2026, 9, 20, 23, 59, 59))).toBe(true);
    expect(isTodaysDailyNotePath(path('2026-10-20'), new Date(2026, 9, 21, 0, 0, 1))).toBe(false);
    expect(isTodaysDailyNotePath(path('2026-10-21'), new Date(2026, 9, 21, 0, 0, 1))).toBe(true);
  });

  it.each([
    // Los Angeles at 8 pm on the 20th: the UTC date is already the 21st, but today is the 20th.
    ['America/Los_Angeles', new Date('2026-10-21T03:00:00Z'), '2026-10-20', '2026-10-21'],
    // Tokyo at 2 am on the 21st: the UTC date is still the 20th, but today is the 21st.
    ['Asia/Tokyo', new Date('2026-10-20T17:00:00Z'), '2026-10-21', '2026-10-20'],
  ])('uses the local date in %s, not the UTC date', (zone, instant, local, utc) => {
    process.env.TZ = zone;

    expect(isTodaysDailyNotePath(path(local), instant)).toBe(true);
    expect(isTodaysDailyNotePath(path(utc), instant)).toBe(false);
  });

  it('is false for no path, a name that is not a real date, or a date-like label', () => {
    const now = new Date(2026, 9, 20, 12);

    expect(isTodaysDailyNotePath(undefined, now)).toBe(false);
    expect(isTodaysDailyNotePath('/vault/Daily Notes/2026/October/2026-13-45.md', now)).toBe(false);
    expect(isTodaysDailyNotePath('/vault/Daily Notes/2026/October/Today.md', now)).toBe(false);
    expect(isTodaysDailyNotePath('/vault/Daily Notes/2026/October/Tue, 20 October.md', now)).toBe(false);
  });
});
