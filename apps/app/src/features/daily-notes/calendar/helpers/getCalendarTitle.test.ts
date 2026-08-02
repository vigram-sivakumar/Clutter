import { describe, expect, it } from 'vitest';

import { getCalendarTitle } from './getCalendarTitle';

describe('getCalendarTitle', () => {
  it('returns the full month name and year for a given date', () => {
    expect(getCalendarTitle('2026-07-15')).toEqual({
      month: 'July',
      year: '2026',
    });
  });

  it('reflects the month and year of the given date, not the current date', () => {
    expect(getCalendarTitle('2019-01-01')).toEqual({
      month: 'January',
      year: '2019',
    });
  });
});
